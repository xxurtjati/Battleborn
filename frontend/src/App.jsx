import React, { useState } from 'react';
import VideoSplitter from './components/VideoSplitter';
import VideoComparison from './components/VideoComparison';
import './App.css';

function App() {
  const [activeTab, setActiveTab] = useState('splitter');

  return (
    <div className="app">
      <header className="app-header">
        <h1>Battleborn</h1>
        <p>HIIT Workout Video Analysis Tool</p>

        <div className="tab-navigation">
          <button
            className={`tab-button ${activeTab === 'splitter' ? 'active' : ''}`}
            onClick={() => setActiveTab('splitter')}
          >
            Video Splitter
          </button>
          <button
            className={`tab-button ${activeTab === 'comparison' ? 'active' : ''}`}
            onClick={() => setActiveTab('comparison')}
          >
            AI Comparison
          </button>
        </div>
      </header>
      <main className="app-main">
        {activeTab === 'splitter' ? <VideoSplitter /> : <VideoComparison />}
      </main>
    </div>
  );
}

export default App;
