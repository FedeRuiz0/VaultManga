import { query, queryOne } from '../db/database.js';
import mangadexScraper from '../services/mangadexScraper.js';

function normalizeGenreForDb(genre) {
  return JSON.stringify(Array.isArray(genre) ? genre : []);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default async function runLibrarySeedBot(options = {}) {
  const {
    limit = 30,
    importChapters = true,
    delayMs = 400,
    batchSize = 50,
    maxRounds = 20,
  } = options;

  console.log(
    `[library-seed-bot] starting limit=${limit} importChapters=${importChapters} delayMs=${delayMs}`
  );

  let offset = 0;
  let round = 0;

  let attempted = 0;
  let seeded = 0;
  let created = 0;
  let updated = 0;
  let chaptersUpdated = 0;
  let failed = 0;

  const seenMangadexIds = new Set();

  while (seeded < limit && round < maxRounds) {
    round += 1;

    const candidates = await mangadexScraper.getPopularManga(batchSize, offset);

    if (!candidates.length) {
      console.log('[library-seed-bot] no more popular candidates');
      break;
    }

    offset += batchSize;

    const uniqueCandidates = candidates.filter((item) => {
      if (!item?.id || seenMangadexIds.has(item.id)) return false;
      seenMangadexIds.add(item.id);
      return true;
    });

    console.log(
      `[library-seed-bot] round=${round} fetched=${candidates.length} unique=${uniqueCandidates.length} offset=${offset}`
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
          console.warn(`[library-seed-bot] skipped mangadex=${candidate.id}: no details`);
          continue;
        }

        if (existing) {
          // ✅ Ya existe: actualizar metadata básica y SOLO buscar capítulos nuevos
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

          updated += 1;

          if (importChapters) {
            const importedCount = await mangadexScraper.importChapters(existing.id, details.id);
            if (importedCount > 0) {
              chaptersUpdated += importedCount;
            }
            console.log(
              `[library-seed-bot] updated "${details.title}" local=${existing.id} created=false chapters=${importedCount}`
            );
          } else {
            console.log(
              `[library-seed-bot] updated "${details.title}" local=${existing.id} created=false chapters=skipped`
            );
          }

          if (delayMs > 0) {
            await sleep(delayMs);
          }

          continue;
        }

        // ✅ No existe: crear manga nuevo
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
          console.warn(`[library-seed-bot] insert failed mangadex=${candidate.id}`);
          continue;
        }

        created += 1;
        seeded += 1;

        let importedCount = 0;
        if (importChapters) {
          importedCount = await mangadexScraper.importChapters(inserted.id, details.id);
        }

        console.log(
          `[library-seed-bot] seeded "${details.title}" local=${inserted.id} created=true chapters=${importedCount}`
        );

        if (delayMs > 0) {
          await sleep(delayMs);
        }
      } catch (error) {
        failed += 1;
        console.error(
          `[library-seed-bot] failed mangadex=${candidate.id}: ${error.message}`
        );
      }
    }
  }

  const result = {
    attempted,
    seeded,
    created,
    updated,
    chaptersUpdated,
    failed,
  };

  console.log(
    `[library-seed-bot] finished attempted=${attempted} seeded=${seeded} created=${created} updated=${updated} chaptersUpdated=${chaptersUpdated} failed=${failed}`
  );

  return result;
}