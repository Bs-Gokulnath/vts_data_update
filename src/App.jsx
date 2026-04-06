import { useState } from 'react';
import FileUpload from './components/FileUpload';
import ProcessingPanel from './components/ProcessingPanel';

export default function App() {
  const [jobs, setJobs] = useState([]);
  const [isUploading, setIsUploading] = useState(false);

  const updateJob = (jobId, patch) => {
    setJobs(prev =>
      prev.map(j => (j.jobId === jobId ? { ...j, ...patch } : j))
    );
  };

  const appendLog = (jobId, log) => {
    setJobs(prev =>
      prev.map(j =>
        j.jobId === jobId ? { ...j, logs: [...j.logs, log] } : j
      )
    );
  };

  const processJob = (jobId) => {
    const evtSource = new EventSource(`/api/process/${jobId}`);

    evtSource.onmessage = (e) => {
      const data = JSON.parse(e.data);

      if (data.type === 'log') {
        appendLog(jobId, { message: data.message, level: data.level });
      } else if (data.type === 'complete') {
        updateJob(jobId, { status: 'completed', summary: data.summary });
        evtSource.close();
      } else if (data.type === 'error') {
        updateJob(jobId, { status: 'error' });
        evtSource.close();
      }
    };

    evtSource.onerror = () => {
      updateJob(jobId, { status: 'error' });
      appendLog(jobId, { message: 'Connection to server lost.', level: 'error' });
      evtSource.close();
    };
  };

  const handleUpload = async (files) => {
    setIsUploading(true);
    try {
      const formData = new FormData();
      files.forEach(f => formData.append('files', f));

      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      if (!res.ok) throw new Error('Upload failed');

      const { jobs: newJobs } = await res.json();

      const jobEntries = newJobs.map(j => ({
        jobId: j.jobId,
        fileName: j.fileName,
        fileSize: j.fileSize,
        status: 'pending',
        logs: [],
        summary: null,
      }));

      setJobs(prev => [...jobEntries, ...prev]);

      // Start processing all jobs
      for (const j of jobEntries) {
        updateJob(j.jobId, { status: 'processing' });
        processJob(j.jobId);
      }
    } catch (err) {
      console.error('Upload error:', err);
    } finally {
      setIsUploading(false);
    }
  };

  const activeCount = jobs.filter(j => j.status === 'processing').length;
  const doneCount   = jobs.filter(j => j.status === 'completed').length;
  const errorCount  = jobs.filter(j => j.status === 'error').length;

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
              </svg>
            </div>
            <div>
              <h1 className="text-white font-bold text-base leading-tight">VTS Data Update</h1>
              <p className="text-slate-500 text-xs">SQL → MongoDB Importer</p>
            </div>
          </div>

          {/* Live stats */}
          {jobs.length > 0 && (
            <div className="flex items-center gap-2 text-xs">
              {activeCount > 0 && (
                <span className="px-2.5 py-1 bg-blue-500/10 text-blue-300 border border-blue-500/20 rounded-full">
                  {activeCount} processing
                </span>
              )}
              {doneCount > 0 && (
                <span className="px-2.5 py-1 bg-green-500/10 text-green-300 border border-green-500/20 rounded-full">
                  {doneCount} done
                </span>
              )}
              {errorCount > 0 && (
                <span className="px-2.5 py-1 bg-red-500/10 text-red-300 border border-red-500/20 rounded-full">
                  {errorCount} failed
                </span>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-5xl mx-auto px-6 py-10">

        {/* DB info banner */}
        <div className="mb-8 flex items-center gap-3 bg-slate-800/50 border border-slate-700/50
          rounded-xl px-4 py-3 text-sm">
          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse flex-shrink-0" />
          <span className="text-slate-400">Target database:</span>
          <code className="text-green-400 font-mono text-xs bg-green-400/5 px-2 py-0.5 rounded">
            vts2020
          </code>
          <span className="text-slate-600 text-xs hidden sm:inline">
            MongoDB Atlas · cluster0.uoyqsob.mongodb.net
          </span>
        </div>

        {/* Upload card */}
        <div className="bg-slate-800/30 border border-slate-700/50 rounded-2xl p-6 mb-8">
          <h2 className="text-slate-200 font-semibold text-base mb-1">Upload SQL Files</h2>
          <p className="text-slate-500 text-sm mb-5">
            Select one or more{' '}
            <code className="text-slate-300 bg-slate-700/50 px-1.5 py-0.5 rounded text-xs">.sql</code>{' '}
            files. Each will be parsed and imported into MongoDB.
          </p>
          <FileUpload onUpload={handleUpload} isUploading={isUploading} />
        </div>

        {/* Job panels */}
        {jobs.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-slate-200 font-semibold text-base">
                Jobs
                <span className="ml-2 text-slate-500 font-normal text-sm">({jobs.length})</span>
              </h2>
              {jobs.every(j => ['completed', 'error'].includes(j.status)) && (
                <button
                  onClick={() => setJobs([])}
                  className="text-xs text-slate-500 hover:text-slate-300 transition-colors
                    px-3 py-1.5 border border-slate-700 rounded-lg hover:border-slate-500"
                >
                  Clear all
                </button>
              )}
            </div>
            <div className="space-y-4">
              {jobs.map(job => (
                <ProcessingPanel key={job.jobId} job={job} />
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {jobs.length === 0 && (
          <div className="text-center py-12 text-slate-600">
            <svg className="w-12 h-12 mx-auto mb-3 opacity-30" fill="none"
              viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
            <p className="text-sm">No jobs yet. Upload SQL files to get started.</p>
          </div>
        )}
      </main>
    </div>
  );
}
