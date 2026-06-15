import { createClient } from '@/lib/supabase'

export default async function Home() {
  const supabase = createClient()
  const { data: venues, error } = await supabase
    .from('venues')
    .select('*')
    .order('name')

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 to-purple-50 p-8">
      <div className="max-w-2xl w-full">
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold text-indigo-900 mb-2">
            🤖🧠 RoboIQ Hub
          </h1>
          <p className="text-xl text-gray-600">Sessions, simplified.</p>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-6">
          <h2 className="text-2xl font-semibold mb-4">Our Venues</h2>
          {error && (
            <p className="text-red-500">Error: {error.message}</p>
          )}
          {venues && (
            <div className="space-y-3">
              {venues.map((venue) => (
                <div
                  key={venue.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50"
                >
                  <div>
                    <p className="font-medium">{venue.name}</p>
                    <p className="text-sm text-gray-500">{venue.address}</p>
                  </div>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-medium ${
                      venue.brand === 'robothink'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-purple-100 text-purple-800'
                    }`}
                  >
                    {venue.brand === 'robothink' ? '🔵 RoboThink' : '🟣 Creative IQ'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <p className="text-center text-sm text-gray-400 mt-6">
          Day 2 ✅ — Database connected
        </p>
      </div>
    </main>
  )
}