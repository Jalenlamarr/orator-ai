import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Mic, Square, Play, Pause, Settings, LayoutDashboard, 
  FileText, TrendingUp, Users, ChevronRight, CheckCircle2, 
  AlertCircle, Sparkles, Volume2, FastForward, Rewind,
  Moon, Sun, BarChart2, BookOpen, Award, Loader2, X
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, query, onSnapshot, orderBy, serverTimestamp, doc, updateDoc, deleteDoc } from 'firebase/firestore';

// --- Configuration & Initialization ---
const apiKey = ""; // Gemini API Key (injected by environment)
const modelName = "gemini-2.5-flash-preview-09-2025";

// Firebase Setup
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const app = Object.keys(firebaseConfig).length > 0 ? initializeApp(firebaseConfig) : null;
const auth = app ? getAuth(app) : null;
const db = app ? getFirestore(app) : null;
const appId = typeof __app_id !== 'undefined' ? __app_id : 'speaking-coach-app';

// --- Utility Components ---

const Toast = ({ message, type, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const bgColors = {
    success: 'bg-emerald-500',
    error: 'bg-red-500',
    info: 'bg-blue-500',
    warning: 'bg-amber-500'
  };

  return (
    <div className={`fixed bottom-4 right-4 flex items-center space-x-2 text-white px-4 py-3 rounded-lg shadow-lg z-50 animate-in slide-in-from-bottom-5 ${bgColors[type] || bgColors.info}`}>
      {type === 'error' ? <AlertCircle size={20} /> : <CheckCircle2 size={20} />}
      <span className="font-medium">{message}</span>
      <button onClick={onClose} className="ml-4 hover:opacity-75"><X size={16} /></button>
    </div>
  );
};

// Custom SVG Line Chart to avoid external dependencies
const SimpleLineChart = ({ data, dataKey, xKey, color = "#3b82f6" }) => {
  if (!data || data.length === 0) return <div className="h-full flex items-center justify-center text-slate-400">No data available</div>;
  
  const maxVal = Math.max(...data.map(d => d[dataKey]), 100);
  const minVal = Math.min(...data.map(d => d[dataKey]), 0);
  const range = maxVal - minVal || 1;
  
  return (
    <div className="relative w-full h-full flex items-end pt-4 pb-6 px-2">
      <svg className="w-full h-full overflow-visible" preserveAspectRatio="none">
        {data.map((point, i) => {
          if (i === 0) return null;
          const prevPoint = data[i - 1];
          const x1 = `${((i - 1) / (data.length - 1)) * 100}%`;
          const y1 = `${100 - ((prevPoint[dataKey] - minVal) / range) * 100}%`;
          const x2 = `${(i / (data.length - 1)) * 100}%`;
          const y2 = `${100 - ((point[dataKey] - minVal) / range) * 100}%`;
          
          return (
            <g key={i}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth="3" strokeLinecap="round" className="animate-in fade-in duration-500" />
              <circle cx={x2} cy={y2} r="4" fill={color} className="animate-in zoom-in duration-500 delay-100" />
            </g>
          );
        })}
        {data.length === 1 && (
          <circle cx="50%" cy={`${100 - ((data[0][dataKey] - minVal) / range) * 100}%`} r="4" fill={color} />
        )}
      </svg>
      {/* X Axis Labels */}
      <div className="absolute bottom-0 left-0 w-full flex justify-between text-xs text-slate-500 font-medium px-2">
        <span>{data[0]?.[xKey]}</span>
        <span>{data[data.length - 1]?.[xKey]}</span>
      </div>
    </div>
  );
};

// --- Main Application ---

export default function App() {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [darkMode, setDarkMode] = useState(true);
  const [toast, setToast] = useState(null);
  
  // Data State
  const [sessions, setSessions] = useState([]);
  const [scripts, setScripts] = useState([]);
  const [activeModule, setActiveModule] = useState(null);
  
  // Auth & Data Fetching
  useEffect(() => {
    if (!auth) return;
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Auth error:", err);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user || !db) return;
    
    // Fetch Sessions
    const sessionsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'sessions');
    const unsubSessions = onSnapshot(sessionsRef, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // Sort manually since we can't use complex queries securely without indexes
      data.sort((a, b) => b.createdAt?.toMillis() - a.createdAt?.toMillis());
      setSessions(data);
    }, (error) => console.error(error));

    // Fetch Scripts
    const scriptsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'scripts');
    const unsubScripts = onSnapshot(scriptsRef, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      data.sort((a, b) => b.createdAt?.toMillis() - a.createdAt?.toMillis());
      setScripts(data);
    }, (error) => console.error(error));

    return () => { unsubSessions(); unsubScripts(); };
  }, [user]);

  const showToast = (message, type = 'info') => setToast({ message, type });

  // --- Views ---

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard': return <DashboardView sessions={sessions} setActiveTab={setActiveTab} setActiveModule={setActiveModule} />;
      case 'practice': return <PracticeView user={user} showToast={showToast} scripts={scripts} activeModule={activeModule} setActiveModule={setActiveModule} />;
      case 'scripts': return <ScriptsView user={user} scripts={scripts} showToast={showToast} setActiveTab={setActiveTab} />;
      case 'progress': return <ProgressView sessions={sessions} />;
      case 'modules': return <ModulesView setActiveTab={setActiveTab} showToast={showToast} setActiveModule={setActiveModule} />;
      default: return <DashboardView sessions={sessions} setActiveTab={setActiveTab} setActiveModule={setActiveModule} />;
    }
  };

  return (
    <div className={`flex h-screen w-full font-sans transition-colors duration-300 ${darkMode ? 'dark bg-slate-950 text-slate-50' : 'bg-slate-50 text-slate-900'}`}>
      
      {/* Sidebar */}
      <aside className="w-64 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col transition-colors duration-300 shrink-0">
        <div className="p-6 flex items-center space-x-3">
          <div className="p-2 bg-blue-600 rounded-xl text-white">
            <Mic size={24} />
          </div>
          <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-500">Orator AI</h1>
        </div>
        
        <nav className="flex-1 px-4 space-y-2 mt-4">
          <NavItem icon={LayoutDashboard} label="Dashboard" isActive={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
          <NavItem icon={Mic} label="Practice Room" isActive={activeTab === 'practice'} onClick={() => { setActiveTab('practice'); setActiveModule(null); }} />
          <NavItem icon={FileText} label="Script Studio" isActive={activeTab === 'scripts'} onClick={() => setActiveTab('scripts')} />
          <NavItem icon={TrendingUp} label="Progress & Insights" isActive={activeTab === 'progress'} onClick={() => setActiveTab('progress')} />
          <NavItem icon={BookOpen} label="Learning Modules" isActive={activeTab === 'modules'} onClick={() => setActiveTab('modules')} />
        </nav>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800">
          <button 
            onClick={() => setDarkMode(!darkMode)}
            className="flex items-center space-x-3 px-4 py-3 w-full rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            {darkMode ? <Sun size={20} className="text-amber-400" /> : <Moon size={20} className="text-slate-600" />}
            <span className="font-medium text-slate-700 dark:text-slate-300">{darkMode ? 'Light Mode' : 'Dark Mode'}</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        {renderContent()}
      </main>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

// --- Components ---

const NavItem = ({ icon: Icon, label, isActive, onClick }) => (
  <button 
    onClick={onClick}
    className={`flex items-center space-x-3 w-full px-4 py-3 rounded-xl transition-all duration-200 ${
      isActive 
        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 font-semibold' 
        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/50 font-medium'
    }`}
  >
    <Icon size={20} />
    <span>{label}</span>
  </button>
);

// --- DASHBOARD VIEW ---
const DashboardView = ({ sessions, setActiveTab, setActiveModule }) => {
  const avgScore = sessions.length ? Math.round(sessions.reduce((acc, s) => acc + (s.score || 0), 0) / sessions.length) : 0;
  const recentSessions = sessions.slice(0, 3);
  
  const chartData = sessions.slice().reverse().slice(-10).map((s, i) => ({
    name: `S${i+1}`,
    score: s.score || 0
  }));

  return (
    <div className="flex-1 overflow-y-auto p-8 space-y-8 animate-in fade-in duration-500">
      <header>
        <h2 className="text-3xl font-bold text-slate-900 dark:text-white">Welcome back, Orator</h2>
        <p className="text-slate-500 dark:text-slate-400 mt-2">Ready to refine your speaking skills today?</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard icon={Award} title="Average Score" value={`${avgScore}/100`} subtext="Across all sessions" color="text-emerald-500" bg="bg-emerald-100 dark:bg-emerald-500/10" />
        <StatCard icon={Mic} title="Total Sessions" value={sessions.length} subtext="Keep practicing!" color="text-blue-500" bg="bg-blue-100 dark:bg-blue-500/10" />
        <StatCard icon={BarChart2} title="Latest Grade" value={sessions[0]?.grade || "N/A"} subtext={sessions[0]?.title || "No sessions yet"} color="text-purple-500" bg="bg-purple-100 dark:bg-purple-500/10" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="col-span-2 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-bold">Performance Trend</h3>
            <button onClick={() => setActiveTab('progress')} className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center">
              View All <ChevronRight size={16} />
            </button>
          </div>
          <div className="h-64">
             <SimpleLineChart data={chartData} dataKey="score" xKey="name" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm flex flex-col">
          <h3 className="text-lg font-bold mb-6">Recent Sessions</h3>
          <div className="flex-1 space-y-4">
            {recentSessions.length === 0 ? (
              <div className="text-center text-slate-500 dark:text-slate-400 mt-10">
                <Mic size={40} className="mx-auto mb-3 opacity-50" />
                <p>No practice sessions yet.</p>
              </div>
            ) : (
              recentSessions.map(session => (
                <div key={session.id} className="p-4 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between">
                  <div>
                    <h4 className="font-semibold text-sm truncate w-32">{session.title || "Practice Session"}</h4>
                    <span className="text-xs text-slate-500">{new Date(session.createdAt?.toMillis()).toLocaleDateString()}</span>
                  </div>
                  <div className={`px-3 py-1 rounded-full text-sm font-bold ${getGradeColor(session.grade)} bg-opacity-10`}>
                    {session.grade || "-"}
                  </div>
                </div>
              ))
            )}
          </div>
          <button 
            onClick={() => {
              setActiveModule(null);
              setActiveTab('practice');
            }}
            className="mt-6 w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors shadow-sm shadow-blue-500/30"
          >
            Start New Practice
          </button>
        </div>
      </div>
    </div>
  );
};

const StatCard = ({ icon: Icon, title, value, subtext, color, bg }) => (
  <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm flex items-start space-x-4">
    <div className={`p-3 rounded-xl ${bg} ${color}`}>
      <Icon size={24} />
    </div>
    <div>
      <p className="text-slate-500 dark:text-slate-400 font-medium text-sm">{title}</p>
      <h3 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{value}</h3>
      <p className="text-xs text-slate-400 mt-1">{subtext}</p>
    </div>
  </div>
);

const getGradeColor = (grade) => {
  if (grade?.startsWith('A')) return 'text-emerald-500 bg-emerald-500';
  if (grade?.startsWith('B')) return 'text-blue-500 bg-blue-500';
  if (grade?.startsWith('C')) return 'text-amber-500 bg-amber-500';
  return 'text-red-500 bg-red-500';
};

// --- PRACTICE ROOM VIEW ---
const PracticeView = ({ user, showToast, scripts, activeModule, setActiveModule }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [duration, setDuration] = useState(0);
  const [fillerCount, setFillerCount] = useState(0);
  const [wpm, setWpm] = useState(0);
  const [audioUrl, setAudioUrl] = useState(null);
  
  const [selectedScript, setSelectedScript] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [feedbackData, setFeedbackData] = useState(null);

  // Audio / Speech Refs
  const recognitionRef = useRef(null);
  const timerRef = useRef(null);
  const canvasRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const sourceRef = useRef(null);
  const requestAnimationFrameRef = useRef(null);
  const durationRef = useRef(0); // Tracks duration without triggering re-renders in hooks
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null);

  // Initialize Speech Recognition
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      
      recognition.onresult = (event) => {
        let currentTranscript = "";
        for (let i = 0; i < event.results.length; i++) {
          currentTranscript += event.results[i][0].transcript;
        }
        setTranscript(currentTranscript);
        
        // Calculate WPM & Filler Words continuously using the ref
        const words = currentTranscript.trim().split(/\s+/).filter(w => w.length > 0);
        const currentDuration = durationRef.current;
        const currentWpm = currentDuration > 0 ? Math.round((words.length / currentDuration) * 60) : 0;
        setWpm(currentWpm);
        
        const fillers = currentTranscript.match(/\b(um|uh|like|you know|literally|basically)\b/gi);
        setFillerCount(fillers ? fillers.length : 0);
      };
      
      recognition.onerror = (event) => {
        console.error("Speech recognition error", event.error);
        if (event.error === 'not-allowed') {
          showToast("Microphone access denied.", "error");
          stopRecording();
        }
      };

      recognitionRef.current = recognition;
    } else {
      showToast("Speech Recognition API not supported in this browser.", "error");
    }

    return () => {
      if (recognitionRef.current) recognitionRef.current.stop();
      if (timerRef.current) clearInterval(timerRef.current);
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') audioContextRef.current.close();
      if (requestAnimationFrameRef.current) cancelAnimationFrame(requestAnimationFrameRef.current);
    };
  }, []); // Removed 'duration' dependency to prevent restarting the mic every second

  const startRecording = async () => {
    if (!recognitionRef.current) return showToast("Speech recognition not available.", "error");
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream; // Save stream so we can fully stop it later
      setupAudioVisualizer(stream);
      
      // Setup actual audio recording for playback
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      
      mediaRecorder.onstop = () => {
        // Use dynamically determined mimeType to ensure browser compatibility
        const audioBlob = new Blob(audioChunksRef.current, { type: mediaRecorder.mimeType || 'audio/webm' });
        const url = URL.createObjectURL(audioBlob);
        setAudioUrl(url);
      };
      
      setTranscript("");
      setDuration(0);
      durationRef.current = 0;
      setFillerCount(0);
      setWpm(0);
      setFeedbackData(null);
      setAudioUrl(null);
      setIsRecording(true);
      
      mediaRecorder.start(500); // 500ms timeslice forces chunks to save periodically
      recognitionRef.current.start();
      
      timerRef.current = setInterval(() => {
        setDuration(d => {
          const newD = d + 1;
          durationRef.current = newD; // Keep ref in sync
          return newD;
        });
      }, 1000);
      
    } catch (err) {
      console.error("Mic access error", err);
      showToast("Could not access microphone.", "error");
    }
  };

  const stopRecording = () => {
    setIsRecording(false);
    if (recognitionRef.current) recognitionRef.current.stop();
    if (timerRef.current) clearInterval(timerRef.current);
    if (sourceRef.current) sourceRef.current.disconnect();
    if (requestAnimationFrameRef.current) cancelAnimationFrame(requestAnimationFrameRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      // Explicitly stop all mic tracks to free up the audio engine for playback
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    
    if (transcript.length === 0) {
      showToast("Session too short to analyze.", "warning");
    } else {
      showToast("Recording stopped. You can now play it back and get feedback.", "success");
    }
  };

  const setupAudioVisualizer = (stream) => {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    audioContextRef.current = new AudioContext();
    analyserRef.current = audioContextRef.current.createAnalyser();
    sourceRef.current = audioContextRef.current.createMediaStreamSource(stream);
    
    sourceRef.current.connect(analyserRef.current);
    analyserRef.current.fftSize = 256;
    
    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const canvas = canvasRef.current;
    const canvasCtx = canvas.getContext("2d");

    const draw = () => {
      if (!isRecording) return;
      requestAnimationFrameRef.current = requestAnimationFrame(draw);
      
      analyserRef.current.getByteFrequencyData(dataArray);
      
      canvasCtx.fillStyle = 'rgba(15, 23, 42, 0.1)'; // Matches slate-950 roughly
      canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
      
      const barWidth = (canvas.width / bufferLength) * 2.5;
      let barHeight;
      let x = 0;
      
      for (let i = 0; i < bufferLength; i++) {
        barHeight = dataArray[i] / 2;
        // Gradient color
        canvasCtx.fillStyle = `rgb(59, 130, 246)`; // Blue 500
        canvasCtx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
        x += barWidth + 1;
      }
    };
    
    draw();
  };

  const analyzeSession = async () => {
    if (transcript.length < 10) return showToast("Not enough speech to analyze.", "error");
    setIsAnalyzing(true);
    try {
      const prompt = `
        Act as an expert public speaking coach. Analyze the following practice session.
        Transcript: "${transcript}"
        Duration: ${duration} seconds
        Filler Words Count: ${fillerCount}
        Pace: ${wpm} words per minute.
        ${activeModule ? `\nCRITICAL INSTRUCTION: The user is completing a specific training module titled "${activeModule.title}" with the goal: "${activeModule.desc}". Your grading, feedback, and identified strengths/weaknesses MUST prioritize evaluating how well they achieved this specific goal.` : ''}
        
        Provide constructive feedback, assigning a letter grade (A, B, C, D, or F) and a numeric score (0-100).
        Respond ONLY with a valid JSON object matching this schema exactly:
        {
          "grade": "String (e.g., 'A-', 'B+')",
          "score": Number,
          "feedback": "String summarizing overall performance",
          "strengths": ["String", "String"],
          "improvements": ["String", "String"]
        }
      `;

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json" }
        })
      });

      const data = await response.json();
      if (data.error) throw new Error(data.error.message);
      
      const resultText = data.candidates[0].content.parts[0].text;
      const feedback = JSON.parse(resultText);
      setFeedbackData(feedback);
      
      // Save to Firebase
      if (user && db) {
        await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'sessions'), {
          title: selectedScript ? `Practice: ${selectedScript.title}` : "Impromptu Session",
          transcript,
          duration,
          wpm,
          fillerCount,
          grade: feedback.grade,
          score: feedback.score,
          aiFeedback: feedback,
          createdAt: serverTimestamp()
        });
        showToast("Session analyzed and saved to history!", "success");
      }

    } catch (err) {
      console.error("AI Analysis Error", err);
      showToast("Failed to analyze session. API Key may be missing or invalid.", "error");
      // Fallback dummy data if API fails
      setFeedbackData({
         grade: "B", score: 80, feedback: "Great effort! (Fallback due to missing API key).",
         strengths: ["Completed the speech", "Good volume"], improvements: ["Add API Key"]
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-8 flex flex-col xl:flex-row gap-8">
      {/* Left Column: Practice Area */}
      <div className="flex-1 flex flex-col space-y-6">
        
        {/* Active Module Banner */}
        {activeModule && (
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-200 dark:border-blue-800 p-5 rounded-2xl flex justify-between items-center shadow-sm">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 flex items-center gap-1 mb-1">
                <Award size={14} /> Active Training Module
              </span>
              <h3 className="font-bold text-lg text-slate-800 dark:text-slate-100">{activeModule.title}</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{activeModule.desc}</p>
            </div>
            <button 
              onClick={() => setActiveModule(null)}
              className="p-2 hover:bg-white dark:hover:bg-slate-800 rounded-xl text-slate-500 transition-colors shadow-sm"
              title="Quit Module"
            >
              <X size={20} />
            </button>
          </div>
        )}

        {/* Controls */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div className="flex items-center space-x-4">
             <button 
               onClick={isRecording ? stopRecording : startRecording}
               className={`w-16 h-16 rounded-full flex items-center justify-center text-white transition-all shadow-lg ${
                 isRecording ? 'bg-red-500 hover:bg-red-600 animate-pulse' : 'bg-blue-600 hover:bg-blue-700'
               }`}
             >
               {isRecording ? <Square fill="currentColor" size={24} /> : <Mic size={28} />}
             </button>
             <div>
               <h2 className="text-2xl font-bold font-mono">{formatTime(duration)}</h2>
               <p className="text-sm text-slate-500">{isRecording ? 'Recording in progress...' : 'Ready to practice'}</p>
             </div>
          </div>
          
          <div className="flex space-x-3 w-1/3">
             <select 
               className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
               onChange={(e) => {
                 const script = scripts.find(s => s.id === e.target.value);
                 setSelectedScript(script || null);
               }}
               value={selectedScript?.id || ""}
               disabled={isRecording}
             >
               <option value="">Select a Script (Optional)</option>
               {scripts.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
             </select>
          </div>
        </div>

        {/* Teleprompter */}
        <div className="flex-1 min-h-[300px] bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden flex flex-col relative shadow-inner">
          <div className="bg-slate-100 dark:bg-slate-900 px-4 py-2 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center z-10">
            <span className="font-semibold text-sm flex items-center gap-2"><BookOpen size={16}/> Teleprompter</span>
            <span className="text-xs text-slate-500 bg-slate-200 dark:bg-slate-800 px-2 py-1 rounded">Read naturally</span>
          </div>
          <div className="flex-1 p-8 overflow-y-auto text-2xl lg:text-4xl leading-relaxed text-slate-800 dark:text-slate-200 font-serif text-center relative">
            {selectedScript ? selectedScript.content : (
              <span className="text-slate-400 italic">Select a script from the dropdown, or just start speaking extemporaneously!</span>
            )}
            
            {/* Live Transcript Overlay (only when extemporaneous) */}
            {isRecording && !selectedScript && (
               <div className="absolute inset-0 p-8 text-left text-lg text-slate-600 dark:text-slate-400 font-sans">
                 {transcript || "Listening..."}
               </div>
            )}
          </div>
        </div>

        {/* Waveform */}
        <div className="h-24 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 overflow-hidden shadow-sm">
           <canvas ref={canvasRef} className="w-full h-full" width="800" height="100"></canvas>
        </div>

        {/* Playback & Save Controls */}
        {audioUrl && !isRecording && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col space-y-4 animate-in fade-in slide-in-from-bottom-4">
            <h3 className="font-bold flex items-center gap-2"><Volume2 size={18}/> Review Recording</h3>
            <audio src={audioUrl} controls className="w-full h-12 outline-none" />
            
            {!feedbackData && (
              <button 
                onClick={analyzeSession} 
                disabled={isAnalyzing}
                className="w-full py-3 bg-purple-600 hover:bg-purple-700 disabled:opacity-70 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-colors"
              >
                {isAnalyzing ? <Loader2 className="animate-spin" size={20} /> : <Sparkles size={20} />}
                {isAnalyzing ? 'Analyzing your speech...' : 'Get AI Feedback & Save Session'}
              </button>
            )}
          </div>
        )}

      </div>

      {/* Right Column: Live Analysis & Audience */}
      <div className="w-full xl:w-96 flex flex-col space-y-6">
        
        {/* Live Audience Simulation */}
        <AudiencePanel isRecording={isRecording} wpm={wpm} fillerCount={fillerCount} />

        {/* Live Metrics */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
          <h3 className="font-bold mb-4 flex items-center gap-2"><TrendingUp size={18}/> Live Metrics</h3>
          <div className="space-y-4">
            <MetricBar label="Pace (WPM)" value={wpm} max={200} idealMin={130} idealMax={160} />
            <MetricBar label="Filler Words" value={fillerCount} max={20} inverse />
          </div>
        </div>

        {/* Post-Session AI Feedback */}
        {isAnalyzing && (
          <div className="bg-blue-50 dark:bg-blue-900/20 p-6 rounded-2xl border border-blue-100 dark:border-blue-800 flex flex-col items-center justify-center space-y-3">
             <Loader2 className="animate-spin text-blue-500" size={32} />
             <p className="font-medium text-blue-700 dark:text-blue-400">AI is analyzing your performance...</p>
          </div>
        )}

        {feedbackData && !isRecording && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-emerald-200 dark:border-emerald-800 p-6 shadow-lg animate-in slide-in-from-right">
             <div className="flex justify-between items-start mb-4">
                <h3 className="font-bold text-lg text-emerald-600 dark:text-emerald-400 flex items-center gap-2"><Sparkles size={20}/> Session Results</h3>
                <div className="text-right">
                  <div className="text-3xl font-black">{feedbackData.grade}</div>
                  <div className="text-sm font-medium text-slate-500">{feedbackData.score}/100</div>
                </div>
             </div>
             
             <p className="text-sm text-slate-700 dark:text-slate-300 mb-4">{feedbackData.feedback}</p>
             
             <div className="space-y-4">
               <div>
                 <h4 className="text-xs font-bold uppercase text-slate-500 mb-2">Strengths</h4>
                 <ul className="text-sm space-y-1">
                   {feedbackData.strengths?.map((s, i) => <li key={i} className="flex items-start gap-2"><CheckCircle2 size={16} className="text-emerald-500 mt-0.5 shrink-0"/><span>{s}</span></li>)}
                 </ul>
               </div>
               <div>
                 <h4 className="text-xs font-bold uppercase text-slate-500 mb-2">Areas to Improve</h4>
                 <ul className="text-sm space-y-1">
                   {feedbackData.improvements?.map((s, i) => <li key={i} className="flex items-start gap-2"><AlertCircle size={16} className="text-amber-500 mt-0.5 shrink-0"/><span>{s}</span></li>)}
                 </ul>
               </div>
             </div>
          </div>
        )}

      </div>
    </div>
  );
};

const MetricBar = ({ label, value, max, idealMin, idealMax, inverse = false }) => {
  let color = 'bg-blue-500';
  let status = 'Good';

  if (inverse) {
    if (value > max * 0.75) { color = 'bg-red-500'; status = 'Too high'; }
    else if (value > max * 0.4) { color = 'bg-amber-500'; status = 'Warning'; }
    else { color = 'bg-emerald-500'; status = 'Excellent'; }
  } else if (idealMin && idealMax) {
    if (value < idealMin) { color = 'bg-amber-500'; status = 'Too slow'; }
    else if (value > idealMax) { color = 'bg-red-500'; status = 'Too fast'; }
    else { color = 'bg-emerald-500'; status = 'Perfect pace'; }
    if (value === 0) status = 'Waiting...';
  }

  const pct = Math.min((value / max) * 100, 100);

  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="font-medium text-slate-700 dark:text-slate-300">{label}</span>
        <span className="text-slate-500">{value} <span className="text-xs">({status})</span></span>
      </div>
      <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden relative">
        <div className={`h-full ${color} transition-all duration-500 rounded-full`} style={{ width: `${pct}%` }}></div>
        {idealMin && idealMax && (
          <div className="absolute top-0 bottom-0 bg-emerald-400/30 border-x border-emerald-500/50" 
               style={{ left: `${(idealMin/max)*100}%`, right: `${100 - (idealMax/max)*100}%` }}></div>
        )}
      </div>
    </div>
  );
};

const AudiencePanel = ({ isRecording, wpm, fillerCount }) => {
  const [reaction, setReaction] = useState('neutral');

  useEffect(() => {
    if (!isRecording) {
      setReaction('neutral');
      return;
    }
    
    // Simple logic to simulate audience reaction
    if (fillerCount > 5 || wpm > 170) {
      setReaction('confused');
    } else if (wpm < 100 && wpm > 10) {
      setReaction('bored');
    } else if (wpm >= 130 && wpm <= 160 && fillerCount < 3) {
      setReaction('engaged');
    } else {
      setReaction('listening');
    }
  }, [wpm, fillerCount, isRecording]);

  const audienceMembers = [
    { id: 1, type: 'person1' }, { id: 2, type: 'person2' }, { id: 3, type: 'person3' },
    { id: 4, type: 'person4' }, { id: 5, type: 'person5' }, { id: 6, type: 'person6' }
  ];

  const getStatusDisplay = () => {
    if (!isRecording) return { icon: Users, text: "Waiting for speaker...", color: "text-slate-400" };
    switch(reaction) {
      case 'engaged': return { icon: Sparkles, text: "Audience is captivated!", color: "text-emerald-500" };
      case 'confused': return { icon: AlertCircle, text: "Losing them (pace/fillers)", color: "text-amber-500" };
      case 'bored': return { icon: Volume2, text: "Energy is low...", color: "text-blue-400" };
      case 'listening': return { icon: Mic, text: "Attentive...", color: "text-blue-500" };
      default: return { icon: Users, text: "Neutral", color: "text-slate-400" };
    }
  };

  const status = getStatusDisplay();
  const StatusIcon = status.icon;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
       <div className="flex justify-between items-center mb-6">
         <h3 className="font-bold flex items-center gap-2"><Users size={18}/> Live Audience</h3>
         <span className={`text-xs font-bold px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 ${status.color} flex items-center gap-1`}>
           <StatusIcon size={12} className={reaction === 'engaged' ? 'animate-pulse' : ''} /> {status.text}
         </span>
       </div>
       
       <div className="grid grid-cols-3 gap-4">
         {audienceMembers.map((m) => (
           <div key={m.id} className="aspect-square bg-slate-50 dark:bg-slate-800 rounded-xl flex items-center justify-center text-4xl shadow-inner relative overflow-hidden">
             <div className={`transition-transform duration-700 ${reaction === 'engaged' ? 'animate-bounce' : ''}`}>
               {reaction === 'neutral' && '😐'}
               {reaction === 'listening' && '🙂'}
               {reaction === 'engaged' && (m.id % 2 === 0 ? '🤩' : '👏')}
               {reaction === 'confused' && '🤨'}
               {reaction === 'bored' && '🥱'}
             </div>
           </div>
         ))}
       </div>
    </div>
  );
};

// --- SCRIPT STUDIO VIEW (AI Generator) ---
const ScriptsView = ({ user, scripts, showToast, setActiveTab }) => {
  const [topic, setTopic] = useState("");
  const [tone, setTone] = useState("Persuasive");
  const [duration, setDuration] = useState("2");
  const [isGenerating, setIsGenerating] = useState(false);

  const generateScript = async (e) => {
    e.preventDefault();
    if (!topic) return showToast("Please enter a topic", "warning");
    
    setIsGenerating(true);
    try {
      const prompt = `
        You are an expert speechwriter. Write a ${duration}-minute ${tone.toLowerCase()} speech about "${topic}".
        Respond ONLY with a valid JSON object matching this schema exactly:
        {
          "title": "A catchy title for the speech",
          "content": "The full text of the speech, written naturally with paragraph breaks."
        }
      `;

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json" }
        })
      });

      const data = await response.json();
      if (data.error) throw new Error(data.error.message);
      
      const resultText = data.candidates[0].content.parts[0].text;
      const scriptData = JSON.parse(resultText);
      
      if (user && db) {
        await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'scripts'), {
          title: scriptData.title,
          content: scriptData.content,
          topic,
          tone,
          createdAt: serverTimestamp()
        });
        showToast("Script generated successfully!", "success");
        setTopic("");
      }
    } catch (err) {
      console.error("AI Gen Error", err);
      showToast("Failed to generate script. Check API key.", "error");
    } finally {
      setIsGenerating(false);
    }
  };

  const deleteScript = async (id) => {
    if (!user || !db) return;
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'scripts', id));
      showToast("Script deleted", "info");
    } catch (e) {
      showToast("Failed to delete", "error");
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-8 max-w-6xl mx-auto w-full">
      <header className="mb-8">
        <h2 className="text-3xl font-bold">Script Studio</h2>
        <p className="text-slate-500 mt-2">Generate custom speeches using AI or manage your existing scripts.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Generator Form */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm h-fit">
          <h3 className="font-bold text-lg mb-6 flex items-center gap-2"><Sparkles size={20} className="text-purple-500"/> AI Speechwriter</h3>
          <form onSubmit={generateScript} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">Topic</label>
              <input 
                type="text" 
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g. The future of remote work"
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-purple-500 transition-shadow"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">Tone/Style</label>
              <select 
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option>Persuasive</option>
                <option>Informational</option>
                <option>Inspirational / Storytelling</option>
                <option>Wedding Toast</option>
                <option>Startup Pitch</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">Length (Minutes)</label>
              <input 
                type="range" min="1" max="10" 
                value={duration} onChange={(e) => setDuration(e.target.value)}
                className="w-full accent-purple-600"
              />
              <div className="text-right text-xs text-slate-500 font-medium mt-1">{duration} minutes</div>
            </div>
            <button 
              type="submit" disabled={isGenerating}
              className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-semibold shadow-md shadow-purple-500/30 flex justify-center items-center gap-2 transition-colors disabled:opacity-70"
            >
              {isGenerating ? <Loader2 className="animate-spin" size={20} /> : <Sparkles size={20} />}
              {isGenerating ? 'Drafting...' : 'Generate Script'}
            </button>
          </form>
        </div>

        {/* Script List */}
        <div className="col-span-2 space-y-4">
          <h3 className="font-bold text-lg mb-2">Your Library</h3>
          {scripts.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-12 text-center text-slate-500 flex flex-col items-center">
              <FileText size={48} className="opacity-20 mb-4" />
              <p>No scripts generated yet.</p>
              <p className="text-sm">Use the AI Speechwriter to create your first draft.</p>
            </div>
          ) : (
            scripts.map(script => (
              <div key={script.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 flex flex-col hover:border-purple-300 dark:hover:border-purple-700 transition-colors shadow-sm group">
                <div className="flex justify-between items-start mb-2">
                  <h4 className="font-bold text-xl">{script.title}</h4>
                  <div className="flex gap-2">
                    <button onClick={() => { setActiveTab('practice'); /* Note: State sync handled in practice view dropdown */ }} className="text-sm bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400 px-3 py-1 rounded-lg font-medium hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors">
                      Practice This
                    </button>
                    <button onClick={() => deleteScript(script.id)} className="text-slate-400 hover:text-red-500 transition-colors">
                      <X size={20} />
                    </button>
                  </div>
                </div>
                <div className="flex gap-2 mb-4">
                  <span className="text-xs px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded text-slate-600 dark:text-slate-400">{script.tone}</span>
                  <span className="text-xs px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded text-slate-600 dark:text-slate-400">{new Date(script.createdAt?.toMillis()).toLocaleDateString()}</span>
                </div>
                <p className="text-slate-600 dark:text-slate-400 text-sm line-clamp-3 font-serif">
                  {script.content}
                </p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

// --- PROGRESS VIEW ---
const ProgressView = ({ sessions }) => {
  const chartData = sessions.slice().reverse().map((s, i) => ({
    name: new Date(s.createdAt?.toMillis()).toLocaleDateString(),
    score: s.score || 0
  }));

  return (
    <div className="flex-1 overflow-y-auto p-8">
      <header className="mb-8">
        <h2 className="text-3xl font-bold">Progress Dashboard</h2>
        <p className="text-slate-500 mt-2">Track your improvement over time.</p>
      </header>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8 shadow-sm mb-8">
        <h3 className="font-bold text-lg mb-6">Overall Score History</h3>
        <div className="h-80 w-full">
           <SimpleLineChart data={chartData} dataKey="score" xKey="name" color="#8b5cf6" />
        </div>
      </div>

      <h3 className="font-bold text-lg mb-4">Session History</h3>
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
              <th className="p-4 font-semibold text-sm">Date</th>
              <th className="p-4 font-semibold text-sm">Speech Title</th>
              <th className="p-4 font-semibold text-sm">Pace (WPM)</th>
              <th className="p-4 font-semibold text-sm">Filler Words</th>
              <th className="p-4 font-semibold text-sm">Grade</th>
              <th className="p-4 font-semibold text-sm">Score</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map(s => (
              <tr key={s.id} className="border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/20 transition-colors">
                <td className="p-4 text-sm text-slate-500">{new Date(s.createdAt?.toMillis()).toLocaleDateString()}</td>
                <td className="p-4 font-medium">{s.title || 'Untitled Session'}</td>
                <td className="p-4 text-sm">{s.wpm}</td>
                <td className="p-4 text-sm">{s.fillerCount}</td>
                <td className="p-4 font-bold"><span className={`${getGradeColor(s.grade)} bg-opacity-20 px-2 py-1 rounded`}>{s.grade}</span></td>
                <td className="p-4 font-medium">{s.score}/100</td>
              </tr>
            ))}
            {sessions.length === 0 && (
              <tr><td colSpan="6" className="p-8 text-center text-slate-500">No sessions recorded yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// --- MODULES VIEW (Confidence Builder) ---
const ModulesView = ({ setActiveTab, showToast, setActiveModule }) => {
  const modules = [
    { id: 1, title: "Level 1: The Basics", desc: "Master volume, pacing, and basic eye contact.", progress: 100, locked: false },
    { id: 2, title: "Level 2: Eradicating Fillers", desc: "Focus entirely on eliminating 'um', 'uh', and 'like'.", progress: 40, locked: false },
    { id: 3, title: "Level 3: Vocal Variety", desc: "Learn to use pitch and tone to emphasize key points.", progress: 0, locked: false },
    { id: 4, title: "Level 4: The Tough Crowd", desc: "Maintain composure while the audience simulation is distracted.", progress: 0, locked: true },
    { id: 5, title: "Masterclass: Impromptu", desc: "Speak on a random topic for 2 minutes with zero preparation.", progress: 0, locked: true },
  ];

  return (
    <div className="flex-1 overflow-y-auto p-8 max-w-5xl mx-auto w-full">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold">Confidence Builder</h2>
          <p className="text-slate-500 mt-2">Structured curriculum to take you from nervous to natural.</p>
        </div>
        <div className="bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 px-4 py-2 rounded-xl flex items-center gap-2 font-bold shadow-sm">
          <Award size={20} /> 3 Day Streak!
        </div>
      </header>

      <div className="space-y-4">
        {modules.map(mod => (
          <div key={mod.id} className={`bg-white dark:bg-slate-900 rounded-2xl border ${mod.locked ? 'border-slate-100 dark:border-slate-800 opacity-60' : 'border-slate-200 dark:border-slate-700'} p-6 flex items-center gap-6 transition-all`}>
            <div className={`w-16 h-16 rounded-full flex items-center justify-center shrink-0 text-xl font-bold ${mod.progress === 100 ? 'bg-emerald-100 text-emerald-600' : mod.locked ? 'bg-slate-100 text-slate-400 dark:bg-slate-800' : 'bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-400'}`}>
              {mod.progress === 100 ? <CheckCircle2 size={32} /> : mod.id}
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-lg">{mod.title} {mod.locked && <span className="text-xs font-normal ml-2 bg-slate-200 dark:bg-slate-800 px-2 py-0.5 rounded text-slate-500">Locked</span>}</h3>
              <p className="text-slate-500 text-sm mt-1">{mod.desc}</p>
              
              {!mod.locked && (
                <div className="mt-4 flex items-center gap-4">
                  <div className="flex-1 h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full" style={{ width: `${mod.progress}%` }}></div>
                  </div>
                  <span className="text-xs font-bold text-slate-500">{mod.progress}%</span>
                </div>
              )}
            </div>
            {!mod.locked && (
               <button 
                 onClick={() => {
                   setActiveModule(mod);
                   setActiveTab('practice');
                   showToast(`Module Active: ${mod.title}`, 'success');
                 }}
                 className="px-6 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 font-medium rounded-xl transition-colors flex items-center gap-2"
               >
                 {mod.progress === 100 ? 'Review' : 'Start Lesson'} <ChevronRight size={16} />
               </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};