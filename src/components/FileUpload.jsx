import { useRef, useState } from 'react';

export default function FileUpload({ onUpload, isUploading }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState([]);

  const handleFiles = (files) => {
    const sqlFiles = Array.from(files).filter(f =>
      f.name.toLowerCase().endsWith('.sql')
    );
    if (sqlFiles.length === 0) return;
    setSelectedFiles(sqlFiles);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const handleSubmit = () => {
    if (selectedFiles.length > 0) onUpload(selectedFiles);
  };

  const removeFile = (idx) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== idx));
  };

  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="w-full">
      {/* Drop Zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => !isUploading && inputRef.current?.click()}
        className={`
          relative border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer
          transition-all duration-200
          ${dragging
            ? 'border-blue-500 bg-blue-950/30 scale-[1.01]'
            : 'border-slate-600 hover:border-blue-500 hover:bg-slate-800/40 bg-slate-800/20'
          }
          ${isUploading ? 'opacity-50 pointer-events-none' : ''}
        `}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".sql"
          className="hidden"
          onChange={e => handleFiles(e.target.files)}
        />

        {/* Upload Icon */}
        <div className="flex justify-center mb-4">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center transition-colors
            ${dragging ? 'bg-blue-500/20' : 'bg-slate-700/50'}`}>
            <svg className={`w-8 h-8 ${dragging ? 'text-blue-400' : 'text-slate-400'}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
          </div>
        </div>

        <p className="text-slate-200 font-semibold text-lg mb-1">
          {dragging ? 'Drop your SQL files here' : 'Drag & drop SQL files here'}
        </p>
        <p className="text-slate-500 text-sm">
          or <span className="text-blue-400 hover:text-blue-300">click to browse</span>
        </p>
        <p className="text-slate-600 text-xs mt-2">Supports multiple .sql files</p>
      </div>

      {/* Selected Files List */}
      {selectedFiles.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="text-slate-400 text-sm font-medium">
            {selectedFiles.length} file{selectedFiles.length > 1 ? 's' : ''} selected
          </p>
          {selectedFiles.map((file, idx) => (
            <div key={idx}
              className="flex items-center gap-3 bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3">
              {/* SQL icon */}
              <div className="w-9 h-9 bg-blue-500/10 border border-blue-500/30 rounded-lg
                flex items-center justify-center flex-shrink-0">
                <span className="text-blue-400 text-xs font-bold">SQL</span>
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-slate-200 text-sm font-medium truncate">{file.name}</p>
                <p className="text-slate-500 text-xs">{formatSize(file.size)}</p>
              </div>

              {!isUploading && (
                <button
                  onClick={(e) => { e.stopPropagation(); removeFile(idx); }}
                  className="text-slate-500 hover:text-red-400 transition-colors p-1 rounded-lg hover:bg-red-400/10"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          ))}

          {/* Upload Button */}
          <button
            onClick={handleSubmit}
            disabled={isUploading}
            className={`
              w-full mt-2 py-3 px-6 rounded-xl font-semibold text-sm transition-all duration-200
              flex items-center justify-center gap-2
              ${isUploading
                ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/20 hover:shadow-blue-500/30 active:scale-[0.98]'
              }
            `}
          >
            {isUploading ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Uploading...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                Upload & Process {selectedFiles.length} File{selectedFiles.length > 1 ? 's' : ''}
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
