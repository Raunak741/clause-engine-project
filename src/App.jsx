import React, { useState, useCallback, useRef } from 'react';

// --- Helper Functions & Backend Simulation ---

// A simple text chunking function
const chunkText = (text, chunkSize = 1000, overlap = 100) => {
    const chunks = [];
    for (let i = 0; i < text.length; i += chunkSize - overlap) {
        chunks.push(text.substring(i, i + chunkSize));
    }
    return chunks;
};

// Improved semantic search simulation with keyword boosting for exclusions
const semanticSearch = (chunks, query) => {
    const lowerQuery = query.toLowerCase();
    const queryWords = new Set(lowerQuery.split(/\s+/).filter(w => w.length > 2));
    
    // Keywords that indicate a query about exclusions
    const isExclusionQuery = ['payable', 'charges', 'covered for', 'excluded'].some(kw => lowerQuery.includes(kw));

    const scoredChunks = chunks.map(chunk => {
        const lowerChunk = chunk.toLowerCase();
        const chunkWords = new Set(lowerChunk.split(/\s+/));
        const intersection = new Set([...queryWords].filter(word => chunkWords.has(word)));
        let score = intersection.size;

        // --- ACCURACY BOOST ---
        // If the user is asking about payability, dramatically boost chunks that talk about exclusions.
        if (isExclusionQuery && ['not payable', 'not covered', 'exclusion', 'annexure i'].some(kw => lowerChunk.includes(kw))) {
            score += 10; // High boost to bring exclusion lists to the top
        }
        
        return { chunk, score };
    });

    return scoredChunks.sort((a, b) => b.score - a.score).slice(0, 7).map(item => item.chunk); // Increased context size
};


// Function to call the Gemini API for analysis
const getDecisionFromLLM = async (query, contextChunks) => {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error("API key not found. Please ensure you have a .env file in the project root with the line: VITE_GEMINI_API_KEY=YOUR_KEY_HERE");
    }
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
    
    // ===================================================================================
    //  FINAL "CHAIN-OF-EVIDENCE" PROMPT FOR MAXIMUM ACCURACY
    // ===================================================================================
    const prompt = `
        You are an elite, hyper-analytical insurance adjudicator AI. Your primary directive is to achieve maximum accuracy by adhering to a strict "Chain-of-Evidence" reasoning process. You must base your decision *exclusively* on the provided context, paying close attention to the source document of each clause.

        **CONTEXT (Policy Clauses, each tagged with its source):**
        ---
        ${contextChunks.join("\n---\n")}
        ---

        **QUERY:**
        ${query}

        **MANDATORY "CHAIN-OF-EVIDENCE" REASONING PROCESS:**

        1.  **Deconstruct Query:** Identify the core question and all facts from the QUERY (e.g., what benefit is being asked about? what are the user's circumstances?).
        2.  **Gather Evidence:**
            -   Scan the CONTEXT for clauses relevant to the query facts.
            -   Crucially, verify that the benefit or rule being asked about exists in the correct source document. Each context chunk is tagged with its source (e.g., [Source: HDFC_Policy.pdf]). If the user asks about a benefit from "Policy A" but the context is from "Policy B", you must identify this mismatch.
            -   Specifically search for any overriding exclusion clauses, especially in any "Annexure" or "not covered" lists, if the query is about payability.
        3.  **State the Conclusion:** Based *only* on the gathered evidence, formulate a final conclusion. If you found a direct exclusion, that takes precedence. If you found a context mismatch, state it.
        4.  **Construct Final JSON:** Build the JSON object based on your conclusion.

        **JSON OUTPUT RULES:**
        -   **decision:** Must be a definitive "Approved", "Rejected", or "Approved (Partial)".
        -   **amount_payable:** Must be a valid number. If rejected, it MUST be 0. If approved, it is the result of any calculations based *only* on the evidence.
        -   **justification:** A summary of your "Chain-of-Evidence". State the primary reason for the decision clearly. Example: "Rejected. The 'nebulizer kit' is explicitly listed as a non-payable item in Annexure I of the HDFC ERGO policy." Another example: "Rejected. The 'Healthy baby expenses' benefit is from the Edelweiss add-on policy, which is not the policy in question."
        -   **clauses:** An array of the most critical pieces of evidence (clauses) that directly led to your conclusion.

        Now, execute the "Chain-of-Evidence" process and return ONLY the final, valid JSON object.
    `;

    const payload = {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" }
    };

    // Retry logic remains the same
    let attempts = 0;
    const maxAttempts = 3;
    while (attempts < maxAttempts) {
        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (response.ok) {
                const result = await response.json();
                if (result.candidates && result.candidates.length > 0) {
                    const rawText = result.candidates[0].content.parts[0].text;
                    try { return JSON.parse(rawText); } catch (parseError) {
                        console.error("Failed to parse JSON response from API:", rawText);
                        throw new Error("Received an invalid response from the AI. Please try again.");
                    }
                } else { throw new Error("No content received from API."); }
            }
            if (response.status === 429 || response.status === 503) {
                attempts++;
                if (attempts >= maxAttempts) { throw new Error("API is overloaded. Please try again later."); }
                const delay = Math.pow(2, attempts) * 1000;
                console.log(`API overloaded. Retrying in ${delay / 1000} seconds...`);
                await new Promise(res => setTimeout(res, delay));
                continue;
            }
            const errorBody = await response.text();
            throw new Error(`API request failed with status ${response.status}: ${errorBody}`);
        } catch (error) {
            console.error("Error calling Gemini API:", error);
            if (attempts >= maxAttempts - 1) { throw error; }
        }
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
    const statusColor = result.decision.includes('Approved') ? 'text-green-400' :
                        result.decision === 'Rejected' ? 'text-red-400' :
                        'text-yellow-400';
    const amount = Number(result.amount_payable);
    const formattedAmount = isNaN(amount) ? '$0.00' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

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
                    <p className="text-2xl font-bold text-white">{formattedAmount}</p>
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

const Loader = ({ message }) => (
    <div className="flex flex-col items-center justify-center text-white mt-8">
        <svg className="animate-spin h-8 w-8 text-indigo-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <p className="mt-3 text-lg">{message}</p>
    </div>
);

const ErrorDisplay = ({ error, onRetry }) => (
    <div className="bg-red-900/50 border border-red-700 text-red-200 p-4 rounded-lg mt-6 text-center">
        <p className="font-bold">An Error Occurred</p>
        <p className="text-sm mt-1">{error}</p>
        <button onClick={onRetry} className="mt-4 px-4 py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-500 transition-colors">
            Try Again
        </button>
    </div>
);

export default function App() {
    const [documentTexts, setDocumentTexts] = useState([]);
    const [query, setQuery] = useState('');
    const [status, setStatus] = useState('idle');
    const [loaderMessage, setLoaderMessage] = useState('');
    const [result, setResult] = useState(null);
    const [error, setError] = useState('');
    const [cache, setCache] = useState({});

    const handleFileChange = async (event) => {
        const files = Array.from(event.target.files);
        if (files.length === 0) return;

        setStatus('processing');
        setLoaderMessage(`Processing ${files.length} document(s)...`);
        setError('');
        setResult(null);

        try {
            const allTexts = await Promise.all(files.map(file => {
                return new Promise((resolve, reject) => {
                    if (file.type !== 'application/pdf') {
                        reject(new Error(`${file.name} is not a valid PDF.`));
                        return;
                    }
                    const reader = new FileReader();
                    reader.onload = async (e) => {
                        const typedarray = new Uint8Array(e.target.result);
                        const pdfJS = await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/+esm');
                        pdfJS.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs`;
                        const pdf = await pdfJS.getDocument({ data: typedarray }).promise;
                        let fullText = '';
                        for (let i = 1; i <= pdf.numPages; i++) {
                            const page = await pdf.getPage(i);
                            const textContent = await page.getTextContent();
                            fullText += textContent.items.map(item => item.str).join(' ') + '\n';
                        }
                        // --- CONTEXT TAGGING ---
                        resolve({ name: file.name, text: `[Source: ${file.name}]\n` + fullText });
                    };
                    reader.onerror = () => reject(new Error(`Failed to read ${file.name}.`));
                    reader.readAsArrayBuffer(file);
                });
            }));
            setDocumentTexts(allTexts);
            setStatus('idle');
        } catch (err) {
            setError(err.message);
            setStatus('error');
        }
    };

    const handleSubmit = useCallback(async (e) => {
        e.preventDefault();
        const combinedText = documentTexts.map(doc => doc.text).join('\n\n');
        if (!combinedText || !query) {
            setError('Please provide at least one document and a query.');
            setStatus('error');
            return;
        }
        if (cache[query]) {
            setResult(cache[query]);
            setStatus('success');
            return;
        }
        setStatus('processing');
        setLoaderMessage('Analyzing query...');
        setError('');
        setResult(null);
        try {
            const chunks = chunkText(combinedText);
            const contextChunks = semanticSearch(chunks, query);
            const decision = await getDecisionFromLLM(query, contextChunks);
            setCache(prevCache => ({ ...prevCache, [query]: decision }));
            setResult(decision);
            setStatus('success');
        } catch (err) {
            setError(err.message || 'An unknown error occurred.');
            setStatus('error');
        }
    }, [documentTexts, query, cache]);

    const handleRetry = () => {
        setStatus('idle');
        setError('');
    };

    const isSubmitDisabled = status === 'processing';

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
                                        1. Upload Policy Documents (PDFs)
                                    </label>
                                    <input
                                        id="document-upload"
                                        type="file"
                                        accept=".pdf"
                                        multiple // Allow multiple files
                                        onChange={handleFileChange}
                                        className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-600 file:text-white hover:file:bg-indigo-500 transition"
                                    />
                                    <div className="mt-2 text-sm text-gray-400">
                                        {documentTexts.length > 0 ? 
                                            `Loaded: ${documentTexts.map(d => d.name).join(', ')}` : 
                                            "No documents loaded."}
                                    </div>
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
                                        placeholder="e.g., Is a nebulizer kit covered under the HDFC policy?"
                                        className="w-full p-3 bg-gray-900 border border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
                                    />
                                </div>
                            </div>
                            <div className="mt-6 text-center">
                                <button type="submit" disabled={isSubmitDisabled} className={`px-8 py-3 text-lg font-bold rounded-full transition-all duration-300 ${isSubmitDisabled ? 'bg-gray-600 text-gray-400 cursor-not-allowed' : 'bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 transform hover:scale-105'}`}>
                                    {status === 'processing' ? 'Analyzing...' : 'Get Decision'}
                                </button>
                            </div>
                        </form>
                    </div>
                    {status === 'processing' && <Loader message={loaderMessage} />}
                    {status === 'error' && <ErrorDisplay error={error} onRetry={handleRetry} />}
                    {status === 'success' && result && <ResultDisplay result={result} />}
                </main>
            </div>
        </div>
    );
}
