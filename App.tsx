import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, LiveServerMessage, Type, Modality } from '@google/genai';
import { SCENARIOS } from './constants';
import { decode, decodeAudioData, encode, float32To16BitPCM } from './audio-utils';
import { FeedbackReport, Scenario } from './types';

// Icons
const PhoneIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
);
const PhoneOffIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"></path><line x1="23" y1="1" x2="1" y2="23"></line></svg>
);
const StarIcon = ({ fill = "none" }: { fill?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill={fill} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-yellow-500"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
);
const RefreshIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
);
const ArrowLeftIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
);
const ExternalLinkIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
);

// --- Component ---

export default function App() {
  const [activeScenario, setActiveScenario] = useState<Scenario | null>(null);
  const [view, setView] = useState<'menu' | 'briefing' | 'call' | 'feedback'>('menu');

  const [connected, setConnected] = useState(false);
  const [isTalking, setIsTalking] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackReport | null>(null);
  const [isGeneratingFeedback, setIsGeneratingFeedback] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const sessionRef = useRef<any>(null); // To store the session object
  const currentInputTransRef = useRef<string>("");
  const currentOutputTransRef = useRef<string>("");
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const audioSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  // -- Session Management --

  const startSession = async () => {
    if (!activeScenario) return;
    setError(null);
    setConnected(false);
    setIsGeneratingFeedback(false);
    setFeedback(null);
    currentInputTransRef.current = "";
    currentOutputTransRef.current = "";
    nextStartTimeRef.current = 0;
    audioSourcesRef.current.clear();

    try {
      // 1. Cleanup previous session if exists
      if (sessionRef.current) {
         sessionRef.current = null;
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop());
        mediaStreamRef.current = null;
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        await audioContextRef.current.close();
      }

      // 2. Initialize Audio
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 24000, // Matching Gemini output
      });
      audioContextRef.current = audioContext;

      // Ensure context is running (sometimes blocked by browser policy)
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      // 3. Connect to Gemini Live
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const config = {
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: activeScenario.systemInstruction,
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Fenrir' } },
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
      };

      const sessionPromise = ai.live.connect({
        ...config,
        callbacks: {
          onopen: () => {
            setConnected(true);
            setView('call');

            // Setup Microphone Stream
            const source = audioContext.createMediaStreamSource(stream);
            sourceRef.current = source;
            
            const processor = audioContext.createScriptProcessor(4096, 1, 1);
            scriptProcessorRef.current = processor;

            processor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const pcmData = float32To16BitPCM(inputData);
              const base64Data = encode(pcmData);
              
              sessionPromise.then((session) => {
                session.sendRealtimeInput({
                  media: {
                    mimeType: "audio/pcm;rate=16000",
                    data: base64Data
                  },
                });
              });
            };

            source.connect(processor);
            processor.connect(audioContext.destination);

            // Save session ref
            sessionPromise.then(s => {
                sessionRef.current = s;
            });
          },
          onmessage: async (msg: LiveServerMessage) => {
            // Handle Transcription
            if (msg.serverContent?.inputTranscription?.text) {
              currentInputTransRef.current += msg.serverContent.inputTranscription.text;
            }
            if (msg.serverContent?.outputTranscription?.text) {
              currentOutputTransRef.current += msg.serverContent.outputTranscription.text;
            }

            // Handle Audio Playback
            const audioData = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (audioData) {
              setIsTalking(true);
              const audioCtx = audioContextRef.current;
              if (audioCtx) {
                // Ensure correct timing
                nextStartTimeRef.current = Math.max(nextStartTimeRef.current, audioCtx.currentTime);

                const audioBuffer = await decodeAudioData(
                  decode(audioData),
                  audioCtx,
                  24000,
                  1
                );

                const source = audioCtx.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(audioCtx.destination);
                
                source.start(nextStartTimeRef.current);
                nextStartTimeRef.current += audioBuffer.duration;
                
                audioSourcesRef.current.add(source);
                
                source.onended = () => {
                    audioSourcesRef.current.delete(source);
                    if (audioSourcesRef.current.size === 0) {
                        setIsTalking(false);
                    }
                };
              }
            }

            // Handle Turn Complete (User turn + Model turn finished)
            if (msg.serverContent?.turnComplete) {
               setIsTalking(false);
            }
          },
          onclose: () => {
            setConnected(false);
          },
          onerror: (err) => {
            console.error(err);
            setError("Er ging iets mis met de verbinding. Probeer het opnieuw.");
            setConnected(false);
          }
        }
      });

    } catch (e) {
      console.error(e);
      setError("Kon geen verbinding maken. Controleer je microfoonrechten.");
    }
  };

  const stopSession = async () => {
    // Stop Microphone Processing
    if (scriptProcessorRef.current) {
        scriptProcessorRef.current.disconnect();
        scriptProcessorRef.current = null;
    }
    if (sourceRef.current) {
        sourceRef.current.disconnect();
        sourceRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current) {
      await audioContextRef.current.close();
      audioContextRef.current = null;
    }
    
    // Close Session (if method exists or just drop ref)
    sessionRef.current = null;
    setConnected(false);
    setView('feedback');
    
    // Generate Feedback
    generateFeedback();
  };

  const generateFeedback = async () => {
    if (!activeScenario) return;
    setIsGeneratingFeedback(true);

    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

        // Flush any pending text
        const fullTranscript = `
        TRANSCRIPT VAN HET GESPREK:
        Student (User): ${currentInputTransRef.current}
        AI (Model): ${currentOutputTransRef.current}
        `;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [
                { role: 'user', parts: [{ text: activeScenario.feedbackPrompt + "\n\n" + fullTranscript }] }
            ],
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    required: ["professionalOpening", "clearCommunication", "targetedQuestions", "activeListening", "clearClosing", "overallSummary"],
                    properties: {
                        professionalOpening: {
                             type: Type.OBJECT,
                             required: ["score", "feedback"],
                             properties: { score: { type: Type.NUMBER }, feedback: { type: Type.STRING } }
                        },
                        clearCommunication: {
                             type: Type.OBJECT,
                             required: ["score", "feedback"],
                             properties: { score: { type: Type.NUMBER }, feedback: { type: Type.STRING } }
                        },
                        targetedQuestions: {
                             type: Type.OBJECT,
                             required: ["score", "feedback"],
                             properties: { score: { type: Type.NUMBER }, feedback: { type: Type.STRING } }
                        },
                        activeListening: {
                             type: Type.OBJECT,
                             required: ["score", "feedback"],
                             properties: { score: { type: Type.NUMBER }, feedback: { type: Type.STRING } }
                        },
                        clearClosing: {
                             type: Type.OBJECT,
                             required: ["score", "feedback"],
                             properties: { score: { type: Type.NUMBER }, feedback: { type: Type.STRING } }
                        },
                        overallSummary: { type: Type.STRING }
                    }
                }
            }
        });

        const json = JSON.parse(response.text);
        setFeedback(json);

    } catch (e) {
        console.error("Feedback generation error:", e);
        setError("Kon geen feedback genereren. Misschien was het gesprek te kort?");
    } finally {
        setIsGeneratingFeedback(false);
    }
  };

  const handleScenarioSelect = (scenario: Scenario) => {
      setActiveScenario(scenario);
      setView('briefing');
  };

  const handleBackToMenu = () => {
      stopSession(); // Ensure cleanup
      setActiveScenario(null);
      setView('menu');
  };

  // --- Render Helpers ---

  const renderHeader = () => (
    <header className="bg-white border-b border-gray-200">
        <div className="h-2 bg-[#E4002B] w-full"></div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
            <div className="flex items-center gap-3">
                 <div className="w-10 h-10 bg-[#004C97] flex items-center justify-center text-white font-bold rounded">
                    ROC
                 </div>
                 <div className="text-[#004C97] font-bold text-xl tracking-tight leading-none">
                    ROC Mondriaan
                 </div>
            </div>
            <div className="text-gray-600 font-medium">
                Telefoonskills @ Edulab
            </div>
        </div>
    </header>
  );

  const renderMenu = () => (
    <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Hero Section */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-8 mb-8 flex flex-col md:flex-row items-center gap-8">
            <div className="flex-1">
                <h1 className="text-3xl font-bold text-[#004C97] mb-4">Oefen je telefonische vaardigheden</h1>
                <p className="text-gray-600 mb-6 text-lg leading-relaxed">
                    Welkom bij de Edulab telefoonsimulatie. Kies hieronder een scenario om een levensecht gesprek te oefenen met een AI-acteurs.
                    Of je nu een stage zoekt, een klacht afhandelt of een verkoopgesprek voert: hier leer je de kneepjes van het vak.
                </p>
                <div className="inline-flex items-center gap-2 text-[#E4002B] font-medium bg-red-50 px-4 py-2 rounded-full">
                   <PhoneIcon /> Kies een scenario om te starten
                </div>
            </div>
             <div className="w-full md:w-1/3 aspect-video relative rounded-lg overflow-hidden shadow-md">
                 <img 
                    src="https://images.unsplash.com/photo-1516321318423-f06f85e504b3?q=80&w=1000&auto=format&fit=crop" 
                    alt="Zakelijk bellen" 
                    className="object-cover w-full h-full"
                 />
            </div>
        </div>

        {/* Scenarios Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {SCENARIOS.map((scenario) => (
                <button 
                    key={scenario.id}
                    onClick={() => handleScenarioSelect(scenario)}
                    className="bg-white rounded-lg border border-gray-200 p-6 text-left hover:border-[#004C97] hover:shadow-lg transition-all group relative overflow-hidden"
                >
                    <div className="absolute top-0 left-0 w-2 h-full" style={{ backgroundColor: scenario.companyColor }}></div>
                    <div className="pl-4">
                        <div className="flex justify-between items-start mb-2">
                             <span className="text-sm font-semibold text-gray-400 uppercase tracking-wider">{scenario.companyName}</span>
                             {scenario.isIncomingCall ? (
                                <span className="bg-yellow-100 text-yellow-800 text-xs px-2 py-1 rounded-full font-medium">Inkomend</span>
                             ) : (
                                <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full font-medium">Uitgaand</span>
                             )}
                        </div>
                        <h3 className="text-xl font-bold text-gray-900 group-hover:text-[#004C97] transition-colors">{scenario.title}</h3>
                        <p className="text-gray-500 mt-1">{scenario.subtitle}</p>
                        <p className="text-gray-600 mt-4 text-sm line-clamp-2">{scenario.description}</p>
                    </div>
                </button>
            ))}
        </div>
    </div>
  );

  const renderBriefing = () => {
      if (!activeScenario) return null;
      return (
        <div className="max-w-4xl mx-auto px-4 py-8">
            <button onClick={handleBackToMenu} className="mb-6 flex items-center text-gray-500 hover:text-[#004C97] transition-colors">
                <ArrowLeftIcon /> <span className="ml-2 font-medium">Terug naar overzicht</span>
            </button>
            
            <div className="bg-white rounded-lg shadow-lg overflow-hidden border border-gray-200">
                <div className="h-3" style={{ backgroundColor: activeScenario.companyColor }}></div>
                <div className="p-8">
                    <div className="flex justify-between items-start">
                        <div>
                            <h2 className="text-3xl font-bold text-gray-900 mb-2">{activeScenario.title}</h2>
                            <p className="text-xl text-gray-600 mb-6">{activeScenario.roleStudent}</p>
                        </div>
                        {activeScenario.externalLink && (
                            <a 
                                href={activeScenario.externalLink} 
                                target="_blank" 
                                rel="noreferrer"
                                className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg font-medium transition-colors"
                            >
                                <ExternalLinkIcon /> Info
                            </a>
                        )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                         <div className="bg-gray-50 p-6 rounded-lg border border-gray-100">
                            <h3 className="font-bold text-[#004C97] mb-3 uppercase text-sm tracking-wide">Context</h3>
                            <p className="text-gray-700 leading-relaxed">{activeScenario.context}</p>
                         </div>
                         <div className="bg-blue-50 p-6 rounded-lg border border-blue-100">
                            <h3 className="font-bold text-[#004C97] mb-3 uppercase text-sm tracking-wide">Jouw Opdracht</h3>
                            <p className="text-gray-700 leading-relaxed">{activeScenario.assignment}</p>
                         </div>
                    </div>

                    <div className="flex items-center gap-4 bg-yellow-50 p-4 rounded-lg mb-8 border border-yellow-100">
                         <div className="bg-yellow-100 p-2 rounded-full">
                             <PhoneIcon />
                         </div>
                         <div>
                             <p className="font-bold text-gray-800">Gesprekstype: {activeScenario.isIncomingCall ? 'Inkomend' : 'Uitgaand'}</p>
                             <p className="text-sm text-gray-600">
                                 {activeScenario.isIncomingCall 
                                    ? `Let op: ${activeScenario.roleAI} belt jou. Jij neemt op.` 
                                    : `Jij belt ${activeScenario.roleAI}. Start het gesprek.`}
                             </p>
                         </div>
                    </div>

                    {error && (
                        <div className="bg-red-50 text-red-700 p-4 rounded-lg mb-6 border border-red-100">
                            {error}
                        </div>
                    )}

                    <button 
                        onClick={startSession}
                        className="w-full bg-[#E4002B] hover:bg-[#c20024] text-white font-bold py-4 rounded-lg shadow-md transition-all flex items-center justify-center gap-3 text-lg"
                    >
                        <PhoneIcon /> Start Simulatie
                    </button>
                </div>
            </div>
        </div>
      );
  };

  const renderCall = () => {
      if (!activeScenario) return null;
      return (
        <div className="fixed inset-0 bg-gray-900 flex flex-col items-center justify-center p-4 z-50">
            <div className="bg-white w-full max-w-md rounded-2xl overflow-hidden shadow-2xl relative">
                 {/* Top Bar */}
                <div className="h-32 flex items-end justify-center pb-4 relative" style={{ backgroundColor: activeScenario.companyColor }}>
                    <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 mt-8">
                        <div className="w-24 h-24 rounded-full border-4 border-white overflow-hidden bg-gray-100 shadow-lg">
                            <img src={activeScenario.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                        </div>
                    </div>
                </div>

                <div className="pt-16 pb-8 px-6 text-center">
                    <h2 className="text-2xl font-bold text-gray-900">{activeScenario.roleAI}</h2>
                    <p className="text-gray-500 mb-8">{activeScenario.companyName}</p>
                    
                    <div className="flex justify-center items-center h-16 mb-8">
                         {isTalking ? (
                             <div className="flex gap-1 items-end h-full">
                                 <div className="w-2 bg-[#E4002B] animate-[pulse_0.6s_ease-in-out_infinite] h-8 rounded-full"></div>
                                 <div className="w-2 bg-[#E4002B] animate-[pulse_0.6s_ease-in-out_infinite_0.1s] h-12 rounded-full"></div>
                                 <div className="w-2 bg-[#E4002B] animate-[pulse_0.6s_ease-in-out_infinite_0.2s] h-6 rounded-full"></div>
                                 <div className="w-2 bg-[#E4002B] animate-[pulse_0.6s_ease-in-out_infinite_0.3s] h-10 rounded-full"></div>
                                 <div className="w-2 bg-[#E4002B] animate-[pulse_0.6s_ease-in-out_infinite_0.4s] h-4 rounded-full"></div>
                             </div>
                         ) : (
                             <div className="text-gray-400 font-medium animate-pulse">Luistert...</div>
                         )}
                    </div>

                    <button 
                        onClick={stopSession}
                        className="bg-red-500 hover:bg-red-600 text-white rounded-full p-6 shadow-lg transition-transform hover:scale-105"
                    >
                        <PhoneOffIcon />
                    </button>
                    <p className="text-xs text-gray-400 mt-4">Klik om het gesprek te beëindigen</p>
                </div>
            </div>
        </div>
      );
  };

  const renderFeedback = () => {
    if (isGeneratingFeedback) {
        return (
             <div className="max-w-2xl mx-auto px-4 py-12 text-center">
                 <div className="w-16 h-16 border-4 border-[#004C97] border-t-transparent rounded-full animate-spin mx-auto mb-6"></div>
                 <h2 className="text-2xl font-bold text-gray-900 mb-2">Gesprek Analyseren...</h2>
                 <p className="text-gray-600">De AI-coach beoordeelt nu je prestaties op de 5 criteria.</p>
             </div>
        );
    }

    if (!feedback) return null;

    const renderScore = (score: number) => {
        const color = score >= 7 ? 'text-green-600' : score >= 5 ? 'text-orange-500' : 'text-red-600';
        return <span className={`font-bold text-lg ${color}`}>{score}/10</span>;
    };

    return (
        <div className="max-w-4xl mx-auto px-4 py-8">
             <div className="bg-white rounded-lg shadow-lg overflow-hidden border border-gray-200">
                <div className="bg-[#004C97] p-6 text-white flex justify-between items-center">
                    <div>
                        <h2 className="text-2xl font-bold">Feedback Rapport</h2>
                        <p className="opacity-90">{activeScenario?.title}</p>
                    </div>
                    <div className="bg-white/10 p-2 rounded">
                        <StarIcon fill="white" />
                    </div>
                </div>

                <div className="p-8">
                    <div className="bg-blue-50 p-6 rounded-lg mb-8 border-l-4 border-[#004C97]">
                        <h3 className="font-bold text-[#004C97] mb-2">Algemene Samenvatting</h3>
                        <p className="text-gray-700 italic">{feedback.overallSummary}</p>
                    </div>

                    <div className="space-y-6">
                        {[
                            { title: "Professionele Opening", data: feedback.professionalOpening },
                            { title: "Duidelijke Communicatie", data: feedback.clearCommunication },
                            { title: "Gerichte Vragen", data: feedback.targetedQuestions },
                            { title: "Actief Luisteren", data: feedback.activeListening },
                            { title: "Heldere Afronding", data: feedback.clearClosing }
                        ].map((item, idx) => (
                            <div key={idx} className="border-b border-gray-100 last:border-0 pb-6 last:pb-0">
                                <div className="flex justify-between items-center mb-2">
                                    <h4 className="font-bold text-gray-800">{item.title}</h4>
                                    {renderScore(item.data.score)}
                                </div>
                                <p className="text-gray-600">{item.data.feedback}</p>
                            </div>
                        ))}
                    </div>

                    <div className="mt-8 pt-6 border-t border-gray-200 flex justify-end gap-4">
                        <button 
                            onClick={handleBackToMenu}
                            className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-3 px-6 rounded-lg transition-colors"
                        >
                            Terug naar Menu
                        </button>
                        <button 
                            onClick={() => setView('briefing')} // Retry same scenario
                            className="bg-[#E4002B] hover:bg-[#c20024] text-white font-bold py-3 px-6 rounded-lg shadow-sm transition-colors flex items-center gap-2"
                        >
                            <RefreshIcon /> Opnieuw Oefenen
                        </button>
                    </div>
                </div>
             </div>
        </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#f3f4f6] font-sans text-gray-900">
      {renderHeader()}
      <main>
        {view === 'menu' && renderMenu()}
        {view === 'briefing' && renderBriefing()}
        {view === 'call' && renderCall()}
        {view === 'feedback' && renderFeedback()}
      </main>
    </div>
  );
}