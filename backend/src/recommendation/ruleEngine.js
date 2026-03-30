export function filterRecommendationCandidates(mangaList = []) {
  return mangaList.filter((manga) => {
    const totalChapters = Number(manga.total_chapters || 0);
    const readChapters = Number(manga.read_chapters || 0);

    if (manga.is_favorite) return false;
    if (totalChapters > 0 && readChapters >= totalChapters) return false;

    return true;
  });
}