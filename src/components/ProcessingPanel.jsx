import { useEffect, useRef } from 'react';

const levelStyles = {
  success: 'text-green-400',
  error: 'text-red-400',
  warn: 'text-yellow-400',
  info: 'text-slate-400',
};

const StatusBadge = ({ status }) => {
  const map = {
    pending:    { label: 'Pending',    cls: 'bg-slate-700 text-slate-300' },
    processing: { label: 'Processing', cls: 'bg-blue-500/20 text-blue-300 animate-pulse' },
    completed:  { label: 'Done',       cls: 'bg-green-500/20 text-green-300' },
    error:      { label: 'Error',      cls: 'bg-red-500/20 text-red-300' },
  };
  const { label, cls } = map[status] || map.pending;
  return (
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${cls}`}>
      {label}
    </span>
  );
};

export default function ProcessingPanel({ job }) {
  const logRef = useRef(null);

  // Auto-scroll to bottom as logs come in
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [job.logs]);

  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-700 bg-slate-800/80">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 bg-blue-500/10 border border-blue-500/30 rounded-lg
            flex items-center justify-center flex-shrink-0">
            <span className="text-blue-400 text-xs font-bold">SQL</span>
          </div>
          <span className="text-slate-200 text-sm font-medium truncate">{job.fileName}</span>
        </div>
        <StatusBadge status={job.status} />
      </div>

      {/* Live Log */}
      <div
        ref={logRef}
        className="log-scroll bg-slate-900/80 h-52 overflow-y-auto px-4 py-3 font-mono text-xs"
      >
        {job.logs.length === 0 ? (
          <span className="text-slate-600">Waiting to start...</span>
        ) : (
          job.logs.map((log, i) => (
            <div key={i} className={`leading-5 ${levelStyles[log.level] || 'text-slate-400'}`}>
              <span className="text-slate-600 select-none mr-2">›</span>
              {log.message}
            </div>
          ))
        )}
        {job.status === 'processing' && (
          <div className="flex items-center gap-1.5 mt-1">
            <span className="text-slate-600">›</span>
            <span className="inline-flex gap-0.5">
              {[0, 1, 2].map(i => (
                <span key={i}
                  className="w-1 h-1 bg-blue-400 rounded-full animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </span>
          </div>
        )}
      </div>

      {/* Summary (shown after completion) */}
      {job.status === 'completed' && job.summary && (
        <div className="border-t border-slate-700 px-5 py-4">
          <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-3">
            Summary
          </p>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <StatCard label="Lines" value={job.summary.lineCount?.toLocaleString()} />
            <StatCard label="Collections" value={job.summary.tableCount} />
            <StatCard label="Documents" value={job.summary.totalDocs?.toLocaleString()} />
          </div>

          {job.summary.collections?.length > 0 && (
            <div className="border border-slate-700 rounded-xl overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-800 text-slate-400">
                    <th className="text-left px-3 py-2 font-medium">Collection</th>
                    <th className="text-right px-3 py-2 font-medium">Fields</th>
                    <th className="text-right px-3 py-2 font-medium">Documents</th>
                  </tr>
                </thead>
                <tbody>
                  {job.summary.collections.map((col, i) => (
                    <tr key={i}
                      className={`border-t border-slate-700/50
                        ${i % 2 === 0 ? 'bg-slate-800/30' : 'bg-slate-800/10'}`}>
                      <td className="px-3 py-2 text-slate-300 font-mono">{col.name}</td>
                      <td className="px-3 py-2 text-slate-400 text-right">{col.fields}</td>
                      <td className="px-3 py-2 text-green-400 text-right font-medium">
                        {col.documents.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Error state */}
      {job.status === 'error' && (
        <div className="border-t border-red-900/50 px-5 py-3 bg-red-900/10">
          <p className="text-red-400 text-xs">Processing failed. Check the logs above for details.</p>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="bg-slate-900/60 border border-slate-700/50 rounded-xl px-3 py-2.5 text-center">
      <p className="text-slate-200 text-base font-bold">{value ?? '—'}</p>
      <p className="text-slate-500 text-xs mt-0.5">{label}</p>
    </div>
  );
}
