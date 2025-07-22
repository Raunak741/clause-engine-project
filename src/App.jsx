import React, { useState, useCallback } from 'react';

// --- Helper Functions & Backend Simulation ---

// A simple text chunking function
const chunkText = (text, chunkSize = 1000, overlap = 100) => {
    const chunks = [];
    for (let i = 0; i < text.length; i += chunkSize - overlap) {
        chunks.push(text.substring(i, i + chunkSize));
    }
    return chunks;
};

// A basic semantic search simulation (keyword-based for this example)
const semanticSearch = (chunks, query) => {
    const queryWords = new Set(query.toLowerCase().split(/\s+/).filter(w => w.length > 2));
    const scoredChunks = chunks.map(chunk => {
        const chunkWords = new Set(chunk.toLowerCase().split(/\s+/));
        const intersection = new Set([...queryWords].filter(word => chunkWords.has(word)));
        return { chunk, score: intersection.size };
    });
    return scoredChunks.sort((a, b) => b.score - a.score).slice(0, 5).map(item => item.chunk);
};

// Function to call the Gemini API for analysis
const getDecisionFromLLM = async (query, contextChunks) => {
    // This is the secure way to access your API key from the .env file in a Vite project.
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    
    if (!apiKey) {
        throw new Error("API key not found. Please ensure you have a .env file in the project root with the line: VITE_GEMINI_API_KEY=YOUR_KEY_HERE");
    }

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

    const prompt = `
        You are an expert insurance claims analyst. Your task is to analyze the following user query and the retrieved policy clauses to provide a structured JSON response.

        CONTEXT (Policy Clauses):
        ---
        ${contextChunks.join("\n---\n")}
        ---

        QUERY:
        ${query}

        INSTRUCTIONS:
        1.  Carefully evaluate the user's query against the provided policy clauses.
        2.  Determine the final decision: "Approved", "Rejected", or "More Information Required".
        3.  Calculate the 'amount_payable' if applicable. If rejected or requires more info, this should be 0.
        4.  Write a clear 'justification' summarizing your reasoning.
        5.  List the exact 'clauses' from the context that support your decision, including a 'clause_text' snippet and the 'reasoning' for its relevance.
        6.  If a crucial piece of information is missing from the query (e.g., whether an injury was due to an accident), state this in your justification and set the decision to "More Information Required".
        7.  Respond ONLY with the structured JSON object. Do not add any introductory text or markdown formatting like \`\`\`json. The entire response should be a single, valid JSON object.

        JSON_OUTPUT:
    `;

    const payload = {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
            responseMimeType: "application/json",
        }
    };

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`API request failed with status ${response.status}: ${errorBody}`);
        }
        const result = await response.json();
        if (result.candidates && result.candidates.length > 0) {
            const rawText = result.candidates[0].content.parts[0].text;
            return JSON.parse(rawText);
        } else {
            throw new Error("No content received from API.");
        }
    } catch (error) {
        console.error("Error calling Gemini API:", error);
        throw error;
    }
};


// --- React Components ---

const Clause = ({ clause, index }) => (
    <div className="bg-gray-800 p-4 rounded-lg mt-4 border border-gray-700">
        <h4 className="font-semibold text-indigo-400 mb-2">Supporting Clause {index + 1}</h4>
        <p className="text-gray-300 text-sm mb-3 italic">"{clause.clause_text}"</p>
        <p className="text-gray-400 text-sm"><strong className="font-medium text-gray-200">Reasoning:</strong> {clause.reasoning}</p>
    </div>
);

const ResultDisplay = ({ result }) => {
    const statusColor = result.decision === 'Approved' ? 'text-green-400' :
                        result.decision === 'Rejected' ? 'text-red-400' :
                        'text-yellow-400';

    return (
        <div className="bg-gray-900/80 backdrop-blur-sm p-6 rounded-xl border border-gray-700 mt-6 animate-fade-in">
            <h3 className="text-2xl font-bold text-white mb-4">Analysis Complete</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-gray-800 p-4 rounded-lg">
                    <p className="text-sm text-gray-400 font-medium">Decision</p>
                    <p className={`text-2xl font-bold ${statusColor}`}>{result.decision}</p>
                </div>
                <div className="bg-gray-800 p-4 rounded-lg">
                    <p className="text-sm text-gray-400 font-medium">Amount Payable</p>
                    <p className="text-2xl font-bold text-white">
                        {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(result.amount_payable)}
                    </p>
                </div>
            </div>
            <div className="mt-6 bg-gray-800 p-4 rounded-lg">
                <p className="text-sm text-gray-400 font-medium">Justification</p>
                <p className="text-white mt-1">{result.justification}</p>
            </div>
            <div className="mt-6">
                {result.clauses && result.clauses.map((clause, index) => (
                    <Clause key={index} clause={clause} index={index} />
                ))}
            </div>
        </div>
    );
};

const Loader = () => (
    <div className="flex flex-col items-center justify-center text-white mt-8">
        <svg className="animate-spin h-8 w-8 text-indigo-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <p className="mt-3 text-lg">Analyzing document and query...</p>
        <p className="text-sm text-gray-400">This may take a moment.</p>
    </div>
);

const ErrorDisplay = ({ error, onRetry }) => (
    <div className="bg-red-900/50 border border-red-700 text-red-200 p-4 rounded-lg mt-6 text-center">
        <p className="font-bold">An Error Occurred</p>
        <p className="text-sm mt-1">{error}</p>
        <button
            onClick={onRetry}
            className="mt-4 px-4 py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-500 transition-colors"
        >
            Try Again
        </button>
    </div>
);

export default function App() {
    const [documentText, setDocumentText] = useState('');
    const [query, setQuery] = useState('');
    const [status, setStatus] = useState('idle'); // idle, processing, success, error
    const [result, setResult] = useState(null);
    const [error, setError] = useState('');

    const handleFileChange = (event) => {
        const file = event.target.files[0];
        if (file && file.type === 'application/pdf') {
            setStatus('processing');
            setError('');
            setResult(null);
            const reader = new FileReader();
            reader.onload = async (e) => {
                const typedarray = new Uint8Array(e.target.result);
                // Dynamically import and use pdf.js from CDN
                const pdfJS = await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/+esm');
                pdfJS.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs`;
                
                const pdf = await pdfJS.getDocument({ data: typedarray }).promise;
                let fullText = '';
                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const textContent = await page.getTextContent();
                    fullText += textContent.items.map(item => item.str).join(' ') + '\n';
                }
                setDocumentText(fullText);
                setStatus('idle');
            };
            reader.onerror = () => {
                setError('Failed to read the PDF file.');
                setStatus('error');
            };
            reader.readAsArrayBuffer(file);
        } else if (file) {
            setError('Please upload a valid PDF file.');
            setStatus('error');
        }
    };

    const handleSubmit = useCallback(async (e) => {
        e.preventDefault();
        if (!documentText || !query) {
            setError('Please provide both a document and a query.');
            setStatus('error');
            return;
        }
        setStatus('processing');
        setError('');
        setResult(null);

        try {
            // 1. Chunk the document text
            const chunks = chunkText(documentText);
            
            // 2. Perform semantic search
            const contextChunks = semanticSearch(chunks, query);
            
            // 3. Get decision from LLM
            const decision = await getDecisionFromLLM(query, contextChunks);
            
            setResult(decision);
            setStatus('success');
        } catch (err) {
            setError(err.message || 'An unknown error occurred during analysis.');
            setStatus('error');
        }
    }, [documentText, query]);

    const handleRetry = () => {
        setStatus('idle');
        setError('');
    };

    const isSubmitDisabled = status === 'processing' || !documentText || !query;

    return (
        <div className="min-h-screen bg-gray-900 text-white font-sans flex flex-col items-center p-4 sm:p-6 lg:p-8">
            <div className="w-full max-w-4xl mx-auto">
                <header className="text-center mb-8">
                    <h1 className="text-4xl sm:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-500">
                        Clause-to-Conclusion Engine
                    </h1>
                    <p className="mt-2 text-lg text-gray-400">
                        AI-Powered Policy Analysis
                    </p>
                </header>

                <main>
                    <div className="bg-gray-800/50 backdrop-blur-sm p-6 rounded-xl border border-gray-700">
                        <form onSubmit={handleSubmit}>
                            <div className="grid grid-cols-1 gap-6">
                                <div>
                                    <label htmlFor="document-upload" className="block text-lg font-medium text-gray-300 mb-2">
                                        1. Upload Policy Document (PDF) or Paste Text
                                    </label>
                                    <input
                                        id="document-upload"
                                        type="file"
                                        accept=".pdf"
                                        onChange={handleFileChange}
                                        className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-600 file:text-white hover:file:bg-indigo-500 transition"
                                    />
                                    <textarea
                                        value={documentText}
                                        onChange={(e) => setDocumentText(e.target.value)}
                                        placeholder="Or paste document text here..."
                                        className="mt-4 w-full h-32 p-3 bg-gray-900 border border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="query-input" className="block text-lg font-medium text-gray-300 mb-2">
                                        2. Ask a Question
                                    </label>
                                    <input
                                        id="query-input"
                                        type="text"
                                        value={query}
                                        onChange={(e) => setQuery(e.target.value)}
                                        placeholder="e.g., 46M, knee surgery, Pune, 3-month policy"
                                        className="w-full p-3 bg-gray-900 border border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
                                    />
                                </div>
                            </div>
                            <div className="mt-6 text-center">
                                <button
                                    type="submit"
                                    disabled={isSubmitDisabled}
                                    className={`px-8 py-3 text-lg font-bold rounded-full transition-all duration-300
                                        ${isSubmitDisabled
                                            ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                                            : 'bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 transform hover:scale-105'
                                        }`}
                                >
                                    {status === 'processing' ? 'Analyzing...' : 'Get Decision'}
                                </button>
                            </div>
                        </form>
                    </div>

                    {status === 'processing' && <Loader />}
                    {status === 'error' && <ErrorDisplay error={error} onRetry={handleRetry} />}
                    {status === 'success' && result && <ResultDisplay result={result} />}
                </main>
            </div>
        </div>
    );
}
