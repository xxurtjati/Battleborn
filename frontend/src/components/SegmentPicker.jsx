import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './SegmentPicker.css';

function SegmentPicker({ isOpen, onClose, onSelect, type }) {
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [selectedSegments, setSelectedSegments] = useState([]);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadOutputs();
    }
  }, [isOpen]);

  const loadOutputs = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/api/video/outputs');
      setBatches(response.data.batches || []);
    } catch (error) {
      console.error('Error loading outputs:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatSize = (bytes) => {
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const handleBatchSelect = (batch) => {
    setSelectedBatch(batch);
    setSelectedSegments(batch.segments.map(s => s.filename));
  };

  const toggleSegment = (filename) => {
    setSelectedSegments(prev => {
      if (prev.includes(filename)) {
        return prev.filter(f => f !== filename);
      } else {
        return [...prev, filename];
      }
    });
  };

  const handleConfirm = () => {
    if (selectedBatch && selectedSegments.length > 0) {
      const segments = selectedBatch.segments
        .filter(s => selectedSegments.includes(s.filename))
        .map(s => ({
          filename: s.filename,
          url: s.url,
          size: s.size
        }));
      onSelect(segments);
      onClose();
    }
  };

  const handleDeleteBatch = async (batch, e) => {
    e.stopPropagation();
    if (!confirm(`Delete all ${batch.segmentCount} segments from this batch?`)) return;

    setDeleting(true);
    try {
      await axios.post('/api/video/outputs/delete', {
        filenames: batch.segments.map(s => s.filename)
      });
      loadOutputs();
      if (selectedBatch?.batchId === batch.batchId) {
        setSelectedBatch(null);
        setSelectedSegments([]);
      }
    } catch (error) {
      alert('Failed to delete: ' + error.message);
    } finally {
      setDeleting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="segment-picker-overlay" onClick={onClose}>
      <div className="segment-picker-modal" onClick={e => e.stopPropagation()}>
        <div className="picker-header">
          <h2>Select {type === 'instructor' ? 'Instructor' : 'User'} Segments</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="picker-content">
          {loading ? (
            <div className="picker-loading">Loading segments...</div>
          ) : batches.length === 0 ? (
            <div className="picker-empty">
              No segments found. Download a YouTube video or upload segments first.
            </div>
          ) : (
            <div className="picker-layout">
              <div className="batch-list">
                <h3>Segment Batches</h3>
                <p className="batch-hint">Click a batch to select its segments</p>
                {batches.map(batch => (
                  <div
                    key={batch.batchId}
                    className={`batch-item ${selectedBatch?.batchId === batch.batchId ? 'selected' : ''}`}
                    onClick={() => handleBatchSelect(batch)}
                  >
                    <div className="batch-info">
                      <div className="batch-name">{batch.batchPrefix}</div>
                      <div className="batch-meta">
                        {batch.segmentCount} segments • {formatSize(batch.totalSize)}
                      </div>
                      <div className="batch-date">{formatDate(batch.createdAt)}</div>
                    </div>
                    <button
                      className="batch-delete-btn"
                      onClick={(e) => handleDeleteBatch(batch, e)}
                      disabled={deleting}
                      title="Delete this batch"
                    >
                      🗑
                    </button>
                  </div>
                ))}
              </div>

              <div className="segment-list">
                {selectedBatch ? (
                  <>
                    <h3>Segments in "{selectedBatch.batchPrefix}"</h3>
                    <div className="segment-select-all">
                      <label>
                        <input
                          type="checkbox"
                          checked={selectedSegments.length === selectedBatch.segments.length}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedSegments(selectedBatch.segments.map(s => s.filename));
                            } else {
                              setSelectedSegments([]);
                            }
                          }}
                        />
                        Select All ({selectedBatch.segments.length})
                      </label>
                    </div>
                    <div className="segment-items">
                      {selectedBatch.segments.map((segment, idx) => (
                        <label key={segment.filename} className="segment-checkbox">
                          <input
                            type="checkbox"
                            checked={selectedSegments.includes(segment.filename)}
                            onChange={() => toggleSegment(segment.filename)}
                          />
                          <span className="segment-num">#{idx + 1}</span>
                          <span className="segment-filename">{segment.filename}</span>
                          <span className="segment-size">{formatSize(segment.size)}</span>
                        </label>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="segment-placeholder">
                    Select a batch from the left to see its segments
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="picker-footer">
          <button className="cancel-btn" onClick={onClose}>Cancel</button>
          <button
            className="confirm-btn"
            onClick={handleConfirm}
            disabled={selectedSegments.length === 0}
          >
            Load {selectedSegments.length} Segment{selectedSegments.length !== 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </div>
  );
}

export default SegmentPicker;
