export default function LeagueLoading() {
    return (
        <main className="min-h-screen bg-gray-950 text-white pt-24 pb-16 px-6">
            <div className="max-w-5xl mx-auto space-y-8">
                <div className="h-4 w-32 bg-gray-800 rounded animate-pulse" />
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
                    <div className="flex items-center gap-4">
                        <div className="w-16 h-16 bg-gray-800 rounded-xl animate-pulse shrink-0" />
                        <div className="space-y-2 flex-1">
                            <div className="h-6 w-48 bg-gray-800 rounded animate-pulse" />
                            <div className="h-4 w-64 bg-gray-800 rounded animate-pulse" />
                        </div>
                    </div>
                </div>
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
                    {[...Array(6)].map((_, i) => (
                        <div key={i} className="h-12 bg-gray-800 rounded-xl animate-pulse" />
                    ))}
                </div>
            </div>
        </main>
    );
}
