import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { libraryApi } from '../services/api'
import MangaCard from '../components/MangaCard'
import LoadingScreen from '../components/LoadingScreen'

export default function History() {

  const { data: overview, isLoading } = useQuery({
    queryKey: ['recentlyRead'],
    queryFn: () => libraryApi.getOverview()
  })

  if (isLoading) return <LoadingScreen />

  const recentlyRead = overview?.recently_read || []

  return (
    <div className="space-y-6">

      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold font-display">
          Recently Read
        </h1>

        <Link 
          to="/library" 
          className="text-primary-400 hover:text-primary-300 flex items-center gap-1 text-sm"
        >
          Full Library
        </Link>
      </div>

      {recentlyRead.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {recentlyRead.map(manga => (
            <MangaCard key={manga.id} manga={manga} />
          ))}
        </div>
      ) : (
        <p className="text-gray-400">
          No recently read manga yet.
        </p>
      )}

    </div>
  )
}