import { query, queryOne } from '../db/database.js';
import mangadexScraper from '../services/mangadexScraper.js';

const GENRE_TAGS = {
  action: '391b0423-d847-456f-aff0-8b0cfc03066b',
  romance: '423e2eae-a7a2-4a8b-ac03-a8351462d71d',
  horror: 'cdad7e68-1419-41dd-bdce-27753074a640',
  fantasy: 'cdc58593-87dd-415e-bbc0-2ec27bf404cc',
  yuri: 'a3c67850-4684-404e-9b7f-c69850ee5da6',
};

function normalizeGenreForDb(genre) {
  return JSON.stringify(Array.isArray(genre) ? genre : []);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default async function runGenreSeedBot(genre, options = {}) {
  const {
    limit = 20,
    importChapters = true,
    delayMs = 400,
    batchSize = 50,
    maxRounds = 20,
  } = options;

  const target = String(genre || '').trim().toLowerCase();
  const tagId = GENRE_TAGS[target];

  if (!tagId) {
    throw new Error(`Unknown genre "${genre}"`);
  }

  console.log(
    `[genre-seed-bot] starting genre="${target}" limit=${limit} importChapters=${importChapters} delayMs=${delayMs}`
  );

  let offset = 0;
  let round = 0;

  let attempted = 0;
  let seeded = 0;
  let created = 0;
  let updated = 0;
  let failed = 0;

  const results = [];
  const seenMangadexIds = new Set();

  while (seeded < limit && round < maxRounds) {
    round += 1;

    console.log(
      `[genre-seed-bot] round=${round} fetching candidates offset=${offset} batchSize=${batchSize}`
    );

    const candidates = await mangadexScraper.searchManga([tagId], batchSize, offset);

    if (!candidates.length) {
      console.log(`[genre-seed-bot] no more candidates for genre="${target}"`);
      break;
    }

    offset += batchSize;

    const uniqueCandidates = candidates.filter((item) => {
      if (!item?.id || seenMangadexIds.has(item.id)) return false;
      seenMangadexIds.add(item.id);
      return true;
    });

    console.log(
      `[genre-seed-bot] round=${round} fetched=${candidates.length} unique=${uniqueCandidates.length}`
    );

    for (const candidate of uniqueCandidates) {
      if (seeded >= limit) break;

      attempted += 1;

      try {
        const sourcePath = `mangadex://${candidate.id}`;

        const existing = await queryOne(
          `
          SELECT id, source_path
          FROM manga
          WHERE source_path = $1
          LIMIT 1
          `,
          [sourcePath]
        );

        const details = await mangadexScraper.getMangaDetails(candidate.id);

        if (!details) {
          failed += 1;
          console.warn(`[genre-seed-bot] skipped mangadex=${candidate.id}: no details`);
          continue;
        }

        if (existing) {
          const updatedRow = await queryOne(
            `
            UPDATE manga
            SET
              title = $2,
              description = $3,
              cover_image = COALESCE($4, cover_image),
              genre = $5,
              status = COALESCE($6, status),
              year = COALESCE($7, year),
              author = COALESCE($8, author),
              artist = COALESCE($9, artist),
              updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
            RETURNING *
            `,
            [
              existing.id,
              details.title,
              details.description || '',
              details.cover_image || null,
              normalizeGenreForDb(details.genre),
              details.status || 'ongoing',
              details.year || null,
              details.author || null,
              details.artist || null,
            ]
          );

          let importedCount = 0;
          if (importChapters) {
            importedCount = await mangadexScraper.importChapters(existing.id, details.id);
          }

          updated += 1;

          console.log(
            `[genre-seed-bot] updated "${details.title}" local=${existing.id} created=false chapters=${importedCount}`
          );

          if (delayMs > 0) {
            await sleep(delayMs);
          }

          continue;
        }

        const inserted = await queryOne(
          `
          INSERT INTO manga (
            id,
            title,
            description,
            cover_image,
            genre,
            status,
            year,
            author,
            artist,
            source_path
          )
          VALUES (
            gen_random_uuid(),
            $1, $2, $3, $4, $5, $6, $7, $8, $9
          )
          RETURNING id
          `,
          [
            details.title,
            details.description || '',
            details.cover_image || null,
            normalizeGenreForDb(details.genre),
            details.status || 'ongoing',
            details.year || null,
            details.author || null,
            details.artist || null,
            sourcePath,
          ]
        );

        if (!inserted?.id) {
          failed += 1;
          continue;
        }

        let importedCount = 0;
        if (importChapters) {
          importedCount = await mangadexScraper.importChapters(inserted.id, details.id);
        }

        created += 1;
        seeded += 1;

        results.push({
          id: inserted.id,
          title: details.title,
          chapters: importedCount,
        });

        console.log(
          `[genre-seed-bot] seeded "${details.title}" local=${inserted.id} created=true chapters=${importedCount}`
        );

        if (delayMs > 0) {
          await sleep(delayMs);
        }
      } catch (error) {
        failed += 1;
        console.error(
          `[genre-seed-bot] failed mangadex=${candidate.id}: ${error.message}`
        );
      }
    }
  }

  const summary = {
    genre: target,
    attempted,
    seeded,
    created,
    updated,
    failed,
    results,
  };

  console.log(
    `[genre-seed-bot] finished genre="${target}" attempted=${attempted} seeded=${seeded} created=${created} updated=${updated} failed=${failed}`
  );

  return summary;
}