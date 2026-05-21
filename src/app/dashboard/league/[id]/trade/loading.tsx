export default function Loading() {
    return (
        <div className="space-y-4">
            <div className="h-4 w-40 bg-gray-800 rounded animate-pulse" />
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
                {[...Array(5)].map((_, i) => (
                    <div key={i} className="h-12 bg-gray-800 rounded-xl animate-pulse" />
                ))}
            </div>
        </div>
    );
}
