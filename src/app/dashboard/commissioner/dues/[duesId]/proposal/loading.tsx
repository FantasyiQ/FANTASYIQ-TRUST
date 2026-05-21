export default function Loading() {
    return (
        <div className="min-h-screen bg-gray-950 pt-24 pb-16 px-6">
            <div className="max-w-5xl mx-auto space-y-6">
                <div className="h-4 w-40 bg-gray-800 rounded animate-pulse" />
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
                    {[...Array(4)].map((_, i) => (
                        <div key={i} className="h-12 bg-gray-800 rounded-xl animate-pulse" />
                    ))}
                </div>
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
                    {[...Array(3)].map((_, i) => (
                        <div key={i} className="h-10 bg-gray-800 rounded-xl animate-pulse" />
                    ))}
                </div>
            </div>
        </div>
    );
}
