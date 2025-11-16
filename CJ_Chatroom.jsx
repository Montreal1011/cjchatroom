import React, { useState, useEffect, useCallback, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { 
    getAuth, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    signInWithCustomToken, 
    onAuthStateChanged, 
    updateProfile,
    signInAnonymously
} from 'firebase/auth';
import { 
    getFirestore, 
    doc, 
    setDoc, 
    getDoc, 
    onSnapshot, 
    collection, 
    query, 
    where, 
    addDoc, 
    orderBy, 
    serverTimestamp,
    updateDoc,
    getDocs, // Added for message fetching
    limit,   // Added for message limiting
} from 'firebase/firestore';
import { MessageCircle, Settings, LogOut, User, Send, Users, Plus, X, ChevronsRight, Search, Zap, Bot, AlignLeft } from 'lucide-react';

// --- GEMINI API CONFIGURATION ---
const GEMINI_MODEL = 'gemini-2.5-flash-preview-09-2025';
const AI_ASSISTANT_ID = 'ai_assistant_gemini';
const AI_ASSISTANT_NAME = "CJ's Assistant";
const AI_ASSISTANT_PHOTO = 'https://placehold.co/150x150/06b6d4/ffffff?text=AI';
const API_KEY = ""; // Canvas will automatically populate this for fetch requests

// --- FIREBASE INITIALIZATION AND CONFIGURATION ---
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const appId = typeof __app_id !== 'undefined' ? __app_id : 'cjc-default-app-id';
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

let app;
try {
    app = initializeApp(firebaseConfig);
} catch (error) {
    console.error("Firebase initialization failed:", error);
}

let auth = app ? getAuth(app) : null;
let db = app ? getFirestore(app) : null;

// Firestore Collection Paths (MUST use the mandated public path structure)
const getCollectionPath = (type) => {
    return `artifacts/${appId}/public/data/${type}`;
};

// Default profile picture function (uses a consistent, colored placeholder)
const getProfilePicture = (displayName) => {
    const seed = displayName ? displayName.charCodeAt(0) * 10 : 0;
    const color = `#${((seed * 123456) % 0xFFFFFF).toString(16).padStart(6, '0')}`;
    const initial = displayName ? displayName[0].toUpperCase() : '?';
    return `https://placehold.co/150x150/${color.substring(1)}/ffffff?text=${initial}`;
};

// --- UTILITY COMPONENTS (Modal, Dropdown, AuthView - Omitted for brevity, assume largely unchanged) ---

const Modal = ({ title, children, isOpen, onClose, size = 'lg' }) => {
    if (!isOpen) return null;

    const sizeClass = size === 'sm' ? 'max-w-md' : size === 'lg' ? 'max-w-xl' : 'max-w-3xl';

    return (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-75 z-50 flex items-center justify-center p-4">
            <div className={`bg-gray-800 rounded-xl w-full ${sizeClass} shadow-2xl p-6 transform transition-all scale-100 opacity-100 border border-cyan-400/50`}>
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-2xl font-bold text-white">{title}</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition">
                        <X size={24} />
                    </button>
                </div>
                {children}
            </div>
        </div>
    );
};

const Dropdown = ({ options, onSelect }) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [dropdownRef]);

    const handleItemClick = (option) => {
        onSelect(option);
        setIsOpen(false);
    };

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className='p-1 bg-indigo-600 hover:bg-indigo-700 rounded-full text-white transition'
                title='Start New Chat'
            >
                <Plus size={16} />
            </button>
            {isOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-gray-700 rounded-lg shadow-xl z-10 border border-cyan-400/50 overflow-hidden">
                    {options.map((option) => (
                        <button
                            key={option.key}
                            onClick={() => handleItemClick(option.key)}
                            className="flex items-center w-full px-4 py-2 text-sm text-white hover:bg-indigo-600 transition"
                        >
                            <option.icon size={16} className="mr-3" />
                            {option.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};


const AuthView = ({ setUserId }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [isLogin, setIsLogin] = useState(true);
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            if (isLogin) {
                // Log In
                const userCredential = await signInWithEmailAndPassword(auth, email, password);
                setUserId(userCredential.user.uid);
            } else {
                // Sign Up
                const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                const user = userCredential.user;

                // Update profile with display name and set initial Firestore document
                await updateProfile(user, { 
                    displayName: displayName, 
                    photoURL: getProfilePicture(displayName)
                });

                // Create user document in public collection
                await setDoc(doc(db, getCollectionPath('users'), user.uid), {
                    displayName: displayName,
                    photoURL: getProfilePicture(displayName),
                    email: user.email,
                    createdAt: serverTimestamp(),
                });

                setUserId(user.uid);
            }
        } catch (err) {
            console.error('Auth Error:', err);
            setError(err.message.replace('Firebase: ', ''));
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
            <div className="bg-gray-800 p-8 rounded-xl shadow-2xl w-full max-w-md border border-cyan-400/50">
                <h1 className="text-3xl font-extrabold text-cyan-400 text-center mb-6">
                    {isLogin ? "Welcome Back to CJ's Chatroom" : "Join CJ's Chatroom"}
                </h1>
                <form onSubmit={handleSubmit} className="space-y-4">
                    {!isLogin && (
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Display Name</label>
                            <input
                                type="text"
                                value={displayName}
                                onChange={(e) => setDisplayName(e.target.value)}
                                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:ring-indigo-500 focus:border-indigo-500"
                                placeholder="e.g., CoolUser123"
                                required={!isLogin}
                            />
                        </div>
                    )}
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Email</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:ring-indigo-500 focus:border-indigo-500"
                            placeholder="you@example.com"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Password</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:ring-indigo-500 focus:border-indigo-500"
                            placeholder="••••••••"
                            required
                        />
                    </div>
                    {error && <p className="text-sm text-red-400 mt-2">{error}</p>}
                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 rounded-lg transition duration-200 disabled:opacity-50 flex items-center justify-center"
                    >
                        {isLoading ? (
                            <svg className="animate-spin h-5 w-5 mr-3 text-white" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                        ) : isLogin ? "Log In" : "Sign Up"}
                    </button>
                </form>
                <p className="mt-6 text-center text-sm text-gray-400">
                    {isLogin ? "Don't have an account?" : "Already have an account?"}{' '}
                    <button
                        onClick={() => setIsLogin(!isLogin)}
                        className="text-cyan-400 hover:text-cyan-300 font-medium transition"
                        type="button"
                    >
                        {isLogin ? "Sign Up" : "Log In"}
                    </button>
                </p>
            </div>
        </div>
    );
};

// --- CHATROOM/DM VIEW COMPONENTS ---

const Message = ({ message, currentUserId, userProfiles }) => {
    const isMe = message.senderId === currentUserId;
    const isAI = message.senderId === AI_ASSISTANT_ID;

    // Use specific AI profile or fallback to general user profile
    const sender = isAI ? { 
        displayName: AI_ASSISTANT_NAME, 
        photoURL: AI_ASSISTANT_PHOTO, 
        isAI: true 
    } : (userProfiles[message.senderId] || { 
        displayName: 'Unknown User', 
        photoURL: getProfilePicture('U') 
    });

    const time = message.timestamp?.toDate ? message.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '...';

    return (
        <div className={`flex mb-2 ${isMe ? 'justify-end' : 'justify-start'}`}>
            <div className={`flex items-start max-w-xs sm:max-w-md ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                {/* Avatar */}
                {!isMe && (
                    <img
                        src={sender.photoURL}
                        alt={sender.displayName}
                        className={`w-8 h-8 rounded-full object-cover mr-3 flex-shrink-0 mt-1 ${isAI ? 'border-2 border-cyan-400' : ''}`}
                        onError={(e) => { e.target.onerror = null; e.target.src = getProfilePicture(sender.displayName); }}
                    />
                )}
                
                <div className={`p-3 rounded-xl shadow-md ${isMe ? 'bg-indigo-600 text-white rounded-br-none' : (isAI ? 'bg-cyan-800 text-cyan-50 rounded-tl-none' : 'bg-gray-700 text-gray-200 rounded-tl-none')}`}>
                    {!isMe && (
                        <p className={`font-semibold text-sm mb-1 ${isAI ? 'text-white' : 'text-gray-400'}`}>
                            {sender.displayName}
                        </p>
                    )}
                    <p className="whitespace-pre-wrap">{message.text}</p>
                    <span className={`text-xs mt-1 block ${isMe ? 'text-indigo-200/80 text-right' : 'text-gray-400 text-left'}`}>
                        {time}
                    </span>
                </div>
            </div>
        </div>
    );
};

const ChatArea = ({ 
    activeChat, 
    currentUserId, 
    userProfiles, 
    onMessageSend,
    onSummarize,
    onDraftReply,
    summaryText,
    isSummarizing,
    isDrafting,
}) => {
    const [messageText, setMessageText] = useState('');
    const [messages, setMessages] = useState([]);
    const [isAITyping, setIsAITyping] = useState(false);
    const messagesEndRef = useRef(null);
    
    const collectionPathSuffix = activeChat?.type === 'chatroom' ? 
        `chatrooms/${activeChat.id}/messages` : 
        `dmThreads/${activeChat?.id}/messages`;

    // Real-time message listener
    useEffect(() => {
        if (!db || !activeChat) return;

        const messagesRef = collection(db, 'artifacts', appId, 'public', 'data', ...collectionPathSuffix.split('/'));
        const q = query(messagesRef, orderBy('timestamp', 'asc')); 

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setMessages(msgs);
        }, (error) => {
            console.error("Error listening to messages:", error);
        });

        return () => unsubscribe();
    }, [activeChat, collectionPathSuffix]); 

    // Scroll to bottom on new message
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, summaryText]); // Scroll on new messages or when summary appears

    if (!activeChat) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                <MessageCircle size={64} className="text-cyan-400 mb-4" />
                <h2 className="text-2xl font-bold text-white mb-2">Welcome to CJ's Chatroom</h2>
                <p className="text-gray-400">Select a Chatroom or Direct Message from the sidebar to begin chatting.</p>
                <p className="text-gray-500 mt-4">Your User ID: <span className='text-xs font-mono'>{currentUserId}</span></p>
            </div>
        );
    }
    
    // Determine chat properties
    let chatTitle = activeChat.name;
    let isChattingWithAI = false;
    let otherParticipantId = null; // Only for 1:1 DMs

    if (activeChat.type === 'dm') {
        const otherParticipants = activeChat.participants.filter(id => id !== currentUserId);
        
        if (otherParticipants.length === 1) {
            otherParticipantId = otherParticipants[0];
            if (otherParticipantId === AI_ASSISTANT_ID) {
                chatTitle = AI_ASSISTANT_NAME;
                isChattingWithAI = true;
            } else {
                chatTitle = userProfiles[otherParticipantId]?.displayName || 'Direct Message';
            }
        } else {
            const names = otherParticipants.map(id => userProfiles[id]?.displayName || 'User').slice(0, 3);
            chatTitle = names.join(', ') + (otherParticipants.length > 3 ? ` +${otherParticipants.length - 3}` : '');
        }
    }


    const handleSend = async (e) => {
        e.preventDefault();
        if (!messageText.trim() || !onMessageSend) return;

        // Check if chatting with AI to show typing indicator
        if (isChattingWithAI) {
            setIsAITyping(true);
        }

        try {
            const messageData = {
                text: messageText.trim(),
                senderId: currentUserId,
                timestamp: serverTimestamp(),
            };
            
            await onMessageSend(activeChat.id, activeChat.type, messageData, activeChat.participants);
            setMessageText('');
        } catch (error) {
            console.error('Error sending message:', error);
        } finally {
            // The AI response logic will turn off the typing indicator.
            if (!isChattingWithAI) {
                 setIsAITyping(false);
            }
        }
    };

    const handleDraftClick = async () => {
        const draftedText = await onDraftReply(activeChat.id);
        if (draftedText && !draftedText.startsWith("Couldn't draft a reply.")) {
            setMessageText(draftedText);
        } else {
            console.error(draftedText); // Log error message
        }
    };


    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 bg-gray-800 border-b border-gray-700">
                <h2 className="text-xl font-bold text-white truncate max-w-full sm:max-w-[60%] mb-2 sm:mb-0">{chatTitle}</h2>
                
                <div className='flex items-center space-x-3'>
                    <span className='text-sm text-cyan-400 font-medium'>{activeChat.type === 'chatroom' ? 'Room' : (isChattingWithAI ? 'AI Chat' : (activeChat.participants.length > 2 ? 'Group DM' : 'DM'))}</span>
                    
                    {/* Summarize Button (Chatroom Only) */}
                    {activeChat.type === 'chatroom' && (
                        <button
                            onClick={() => onSummarize(activeChat.id)}
                            disabled={isSummarizing}
                            className='flex items-center text-sm bg-indigo-500 hover:bg-indigo-600 text-white font-semibold py-1.5 px-3 rounded-full transition disabled:opacity-50'
                            title="Summarize last 30 messages"
                        >
                            <AlignLeft size={16} className="mr-1" />
                            {isSummarizing ? 'Summarizing...' : '✨ Summarize Chat'}
                        </button>
                    )}
                </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                
                {/* Summary Display */}
                {summaryText && (
                    <div className="p-4 bg-indigo-900/50 border-l-4 border-indigo-500 rounded-lg shadow-md text-sm text-white">
                        <p className="font-bold mb-1 flex items-center text-indigo-300"><AlignLeft size={16} className="mr-2" /> Conversation Summary:</p>
                        <p className="whitespace-pre-wrap">{summaryText}</p>
                    </div>
                )}
                
                {messages.length === 0 ? (
                    <p className="text-center text-gray-500 pt-10">
                        {isChattingWithAI ? `Say hello to ${AI_ASSISTANT_NAME}!` : 'Start the conversation!'}
                    </p>
                ) : (
                    messages.map(msg => (
                        <Message 
                            key={msg.id} 
                            message={msg} 
                            currentUserId={currentUserId} 
                            userProfiles={userProfiles} 
                        />
                    ))
                )}
                
                {/* AI Typing Indicator */}
                {(isAITyping || isDrafting) && (
                    <div className="flex justify-start">
                        <div className="flex items-center p-3 rounded-xl bg-cyan-800 text-cyan-50">
                            <Bot size={18} className="mr-2 animate-pulse" />
                            <p className="text-sm italic">
                                {isAITyping ? `${AI_ASSISTANT_NAME} is typing...` : 'Drafting reply...'}
                            </p>
                        </div>
                    </div>
                )}
                
                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <form onSubmit={handleSend} className="p-4 bg-gray-800 border-t border-gray-700 flex space-x-2">
                
                {/* Draft Reply Button (1:1 DM Only, excluding AI) */}
                {activeChat.type === 'dm' && !isChattingWithAI && activeChat.participants.length === 2 && (
                    <button
                        type="button"
                        onClick={handleDraftClick}
                        disabled={isDrafting || isAITyping || !messages.some(msg => msg.senderId === otherParticipantId)}
                        className="flex items-center text-sm bg-cyan-600 hover:bg-cyan-700 text-white font-semibold py-2.5 px-3 rounded-lg transition duration-200 disabled:opacity-50 flex-shrink-0"
                        title="Draft a suggested reply based on the last message"
                    >
                        {isDrafting ? 'Drafting...' : '✨ Draft Reply'}
                    </button>
                )}
                
                <input
                    type="text"
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    placeholder={`Message ${chatTitle}...`}
                    className="flex-1 px-4 py-2 bg-gray-700 border border-gray-600 rounded-l-lg text-white placeholder-gray-500 focus:ring-indigo-500 focus:border-indigo-500 outline-none rounded-r-none"
                    disabled={!activeChat || isAITyping || isDrafting}
                />
                <button
                    type="submit"
                    className="bg-indigo-600 hover:bg-indigo-700 text-white p-2.5 rounded-r-lg transition duration-200 disabled:opacity-50"
                    disabled={!activeChat || !messageText.trim() || isAITyping || isDrafting}
                    title="Send Message"
                >
                    <Send size={24} />
                </button>
            </form>
        </div>
    );
};


// --- OTHER MODALS (Settings, CreateChatroom, UserSelection - Omitted for brevity, assume unchanged) ---

const SettingsContent = ({ user, userProfile, updateProfileData, onClose }) => {
    const [displayName, setDisplayName] = useState(userProfile.displayName || '');
    const [photoURL, setPhotoURL] = useState(userProfile.photoURL || '');
    const [isSaving, setIsSaving] = useState(false);

    const handleSave = async () => {
        if (displayName === userProfile.displayName && photoURL === userProfile.photoURL) {
            onClose();
            return;
        }
        if (!displayName.trim()) return;

        setIsSaving(true);
        try {
            await updateProfileData(user.uid, {
                displayName: displayName,
                photoURL: photoURL || getProfilePicture(displayName),
            });
            onClose();
        } catch (e) {
            console.error("Failed to update profile:", e);
            // Replace alert with custom UI message if needed, keeping simple for this block
            console.log("Failed to save settings. Check console for details.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleLogout = () => {
        auth.signOut().catch(console.error);
        onClose();
    };

    return (
        <div className="space-y-6">
            <h4 className="text-xl font-semibold text-cyan-400">User Profile</h4>
            <div className="flex items-center space-x-4">
                <img 
                    src={photoURL || getProfilePicture(displayName)} 
                    alt="Profile" 
                    className="w-16 h-16 rounded-full object-cover border-2 border-indigo-600"
                    onError={(e) => { e.target.onerror = null; e.target.src = getProfilePicture(displayName); }}
                />
                <div>
                    <p className="text-white font-medium">{user.email}</p>
                    <p className="text-gray-400 text-sm">User ID: <span className='font-mono text-xs'>{user.uid}</span></p>
                </div>
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Display Name</label>
                <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                />
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Profile Picture URL</label>
                <input
                    type="url"
                    value={photoURL}
                    onChange={(e) => setPhotoURL(e.target.value)}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                    placeholder="Enter a URL or leave empty for a colored default"
                />
                <p className='text-xs text-gray-500 mt-1'>Note: Use a public image URL. If invalid, the default image will be used.</p>
            </div>

            <div className="flex justify-between pt-4 border-t border-gray-700">
                <button
                    onClick={handleLogout}
                    className="flex items-center bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded-lg transition duration-200"
                >
                    <LogOut size={18} className="mr-2" /> Log Out
                </button>
                <button
                    onClick={handleSave}
                    disabled={isSaving || !displayName.trim()}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-4 rounded-lg transition duration-200 disabled:opacity-50"
                >
                    {isSaving ? 'Saving...' : 'Save Changes'}
                </button>
            </div>
        </div>
    );
};


const CreateChatroomModal = ({ isOpen, onClose, createChatroom }) => {
    const [name, setName] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        if (!name.trim()) {
            setError('Chatroom name cannot be empty.');
            return;
        }

        setIsLoading(true);
        try {
            await createChatroom(name.trim()); // The function now manages currentUserId
            setName('');
            onClose();
        } catch (e) {
            console.error('Error creating chatroom:', e);
            setError('Failed to create chatroom.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Modal title="Create New Chatroom" isOpen={isOpen} onClose={onClose} size="sm">
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Chatroom Name</label>
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:ring-indigo-500 focus:border-indigo-500"
                        placeholder="e.g., General Lounge"
                        required
                    />
                </div>
                {error && <p className="text-sm text-red-400">{error}</p>}
                <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 rounded-lg transition duration-200 disabled:opacity-50"
                >
                    {isLoading ? 'Creating...' : 'Create Chatroom'}
                </button>
            </form>
        </Modal>
    );
};


const UserSelectionModal = ({ 
    isOpen, 
    onClose, 
    userProfiles, 
    currentUserId, 
    mode, 
    createDmThread, 
    dmThreads 
}) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedUserIds, setSelectedUserIds] = useState([]);
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const isGroupMode = mode === 'group';
    const isDMMode = mode === 'dm';

    const modalTitle = isGroupMode ? 'Start New Group Chat' : 'Start New Direct Message';

    // Filter users based on search query and exclude current user AND AI Assistant
    const filteredUsers = Object.values(userProfiles)
        .filter(p => p.id !== currentUserId && p.id !== AI_ASSISTANT_ID)
        .filter(p => 
            p.displayName.toLowerCase().includes(searchQuery.toLowerCase()) || 
            (p.email && p.email.toLowerCase().includes(searchQuery.toLowerCase()))
        )
        .sort((a, b) => a.displayName.localeCompare(b.displayName));
    
    // Convert object to array for easier iteration
    // const userProfileList = Object.keys(userProfiles).map(id => ({ id, ...userProfiles[id] }));

    const toggleUser = (userId) => {
        if (selectedUserIds.includes(userId)) {
            setSelectedUserIds(prev => prev.filter(id => id !== userId));
        } else {
            // In DM mode, only allow selecting one user
            if (isDMMode) {
                setSelectedUserIds([userId]);
            } else {
                setSelectedUserIds(prev => [...prev, userId]);
            }
        }
        setError('');
    };

    const handleSubmit = async () => {
        if (selectedUserIds.length === 0) {
            setError('Please select at least one user.');
            return;
        }

        if (isDMMode && selectedUserIds.length !== 1) {
            setError('Please select exactly one user for a Direct Message.');
            return;
        }

        if (isGroupMode && selectedUserIds.length < 2) {
             setError('Please select at least two users for a Group Chat.');
             return;
        }

        setIsLoading(true);
        setError('');
        try {
            await createDmThread(selectedUserIds);
            onClose();
            setSelectedUserIds([]);
            setSearchQuery('');
        } catch (e) {
            console.error('Error creating chat:', e);
            setError('Failed to create chat. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    // Reset state on modal open/close
    useEffect(() => {
        if (!isOpen) {
            setSelectedUserIds([]);
            setSearchQuery('');
            setError('');
        }
    }, [isOpen]);

    return (
        <Modal title={modalTitle} isOpen={isOpen} onClose={onClose} size="lg">
            <div className="space-y-4">
                {/* Search Bar */}
                <div className="relative">
                    <Search size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search users by name or email..."
                        className="w-full pl-10 pr-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                </div>

                {/* Selected Users Preview */}
                <div className='flex flex-wrap gap-2 min-h-[40px] p-2 bg-gray-700/50 rounded-lg border border-gray-700'>
                    {selectedUserIds.length > 0 ? (
                        selectedUserIds.map(id => (
                            <span key={id} className='flex items-center bg-indigo-600 text-white text-sm px-3 py-1 rounded-full'>
                                {userProfiles[id]?.displayName || 'User'}
                                <button onClick={() => toggleUser(id)} className='ml-1.5 opacity-75 hover:opacity-100'><X size={12} /></button>
                            </span>
                        ))
                    ) : (
                        <p className='text-gray-500 text-sm italic'>Select users below...</p>
                    )}
                </div>

                {/* User List */}
                <div className="h-64 overflow-y-auto space-y-2 p-2 bg-gray-700 rounded-lg border border-gray-600 custom-scrollbar">
                    {filteredUsers.length > 0 ? filteredUsers.map(user => (
                        <div
                            key={user.id}
                            onClick={() => toggleUser(user.id)}
                            className={`flex items-center p-2 rounded-lg cursor-pointer transition ${selectedUserIds.includes(user.id) ? 'bg-indigo-600' : 'hover:bg-gray-600'}`}
                        >
                            <img 
                                src={user.photoURL} 
                                alt={user.displayName}
                                className="w-8 h-8 rounded-full object-cover mr-3 border border-indigo-500/50"
                                onError={(e) => { e.target.onerror = null; e.target.src = getProfilePicture(user.displayName); }}
                            />
                            <div className="flex-1 min-w-0">
                                <p className="font-medium truncate text-white">{user.displayName}</p>
                                <p className="text-xs text-gray-300 truncate">{user.email}</p>
                            </div>
                            {selectedUserIds.includes(user.id) && <ChevronsRight size={20} className="text-white ml-auto" />}
                        </div>
                    )) : (
                        <p className='text-center text-gray-500 pt-10'>No users found matching "{searchQuery}".</p>
                    )}
                </div>

                {error && <p className="text-sm text-red-400">{error}</p>}
                
                <button
                    onClick={handleSubmit}
                    disabled={isLoading || selectedUserIds.length === 0 || (isDMMode && selectedUserIds.length !== 1) || (isGroupMode && selectedUserIds.length < 2)}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 rounded-lg transition duration-200 disabled:opacity-50 flex items-center justify-center"
                >
                    {isLoading ? 'Creating...' : (isDMMode ? 'Start Direct Message' : 'Start Group Chat')}
                </button>
            </div>
        </Modal>
    );
};


// --- MAIN APP COMPONENT ---

const App = () => {
    const [user, setUser] = useState(null);
    const [currentUserId, setCurrentUserId] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);
    
    // Core Data States
    const [chatrooms, setChatrooms] = useState([]);
    const [dmThreads, setDmThreads] = useState([]);
    const [userProfiles, setUserProfiles] = useState({});

    // UI States
    const [activeChat, setActiveChat] = useState(null);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isCreateChatroomOpen, setIsCreateChatroomOpen] = useState(false);
    
    // New States for Dropdown functionality
    const [isUserSelectionModalOpen, setIsUserSelectionModalOpen] = useState(false);
    const [userSelectionMode, setUserSelectionMode] = useState(null); // 'dm' or 'group'

    // LLM Feature States
    const [summaryText, setSummaryText] = useState(null);
    const [isSummarizing, setIsSummarizing] = useState(false);
    const [isDrafting, setIsDrafting] = useState(false);


    // Effect to clear summary when chat changes
    useEffect(() => {
        setSummaryText(null);
    }, [activeChat]);

    // --- AI LOGIC FUNCTIONS ---

    const getDmThreadId = (userA, userB) => {
        // Create a unique, consistent ID by sorting the user IDs
        const participants = [userA, userB].sort();
        return participants.join('_');
    };

    const handleAIResponse = useCallback(async (dmThreadId, messageText) => {
        if (!db) return;

        const systemPrompt = "You are CJ's Assistant, a helpful, friendly, and concise AI chatbot in a private chatroom. Keep your responses short and informal.";
        const userQuery = messageText;
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${API_KEY}`;
        const maxRetries = 5;
        let attempt = 0;

        const payload = {
            contents: [{ parts: [{ text: userQuery }] }],
            tools: [{ "google_search": {} }],
            systemInstruction: { parts: [{ text: systemPrompt }] },
        };

        while (attempt < maxRetries) {
            try {
                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (response.status === 429 && attempt < maxRetries - 1) {
                    const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
                    await new Promise(resolve => setTimeout(resolve, delay));
                    attempt++;
                    continue; // Retry
                }
                
                if (!response.ok) {
                    throw new Error(`API request failed with status: ${response.status}`);
                }

                const result = await response.json();
                const candidate = result.candidates?.[0];
                const aiResponseText = candidate?.content?.parts?.[0]?.text || "Sorry, I couldn't generate a response right now.";
                
                // Send the AI response back to the DM thread
                const messagesRef = collection(db, 'artifacts', appId, 'public', 'data', `dmThreads/${dmThreadId}/messages`);
                await addDoc(messagesRef, {
                    text: aiResponseText,
                    senderId: AI_ASSISTANT_ID,
                    timestamp: serverTimestamp(),
                });
                
                return; // Success
                
            } catch (error) {
                console.error("AI API Error:", error);
                // If it's not a 429, log and stop retrying after the first attempt
                attempt = maxRetries; 
            }
        }
        
    }, [db]);

    const handleSummarizeChat = useCallback(async (chatId) => {
        if (!db || !chatId) return;

        setSummaryText(null);
        setIsSummarizing(true);
        
        try {
            // 1. Fetch last 30 messages
            const messagesRef = collection(db, 'artifacts', appId, 'public', 'data', `chatrooms/${chatId}/messages`);
            const q = query(messagesRef, orderBy('timestamp', 'desc'), limit(30)); 
            const snapshot = await getDocs(q);
            const msgs = snapshot.docs.map(doc => doc.data()).reverse(); // Reverse to chronological order

            if (msgs.length === 0) {
                setSummaryText("No messages to summarize.");
                return;
            }

            // 2. Format content
            const chatTranscript = msgs.map(msg => {
                const senderName = userProfiles[msg.senderId]?.displayName || 'Unknown';
                const time = msg.timestamp?.toDate ? msg.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '[Time]';
                return `[${time}] ${senderName}: ${msg.text}`;
            }).join('\n');

            const systemPrompt = "You are a concise summarization bot. Your task is to provide a single, easy-to-read paragraph summary of the following chat transcript, focusing on the main topics and key decisions. Start with 'Key Summary:'.";
            const userQuery = `Please summarize this chat transcript, which contains ${msgs.length} messages:\n\n---\n${chatTranscript}\n---`;
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${API_KEY}`;
            
            // 3. Call API (non-grounded)
            const payload = {
                contents: [{ parts: [{ text: userQuery }] }],
                systemInstruction: { parts: [{ text: systemPrompt }] },
            };
            
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            
            if (!response.ok) throw new Error("API call failed.");
            
            const result = await response.json();
            const summary = result.candidates?.[0]?.content?.parts?.[0]?.text || "Could not generate summary.";
            
            setSummaryText(summary);
            
        } catch (error) {
            console.error("Summarization API Error:", error);
            setSummaryText("Error generating summary. Please try again.");
        } finally {
            setIsSummarizing(false);
        }
    }, [db, userProfiles]);

    const handleDraftReply = useCallback(async (chatId) => {
        if (!db || !currentUserId || !chatId) return;
        
        setIsDrafting(true);

        // 1. Fetch the last message
        const messagesRef = collection(db, 'artifacts', appId, 'public', 'data', `dmThreads/${chatId}/messages`);
        const q = query(messagesRef, orderBy('timestamp', 'desc'), limit(1)); 
        const snapshot = await getDocs(q);
        const lastMessage = snapshot.docs[0]?.data();

        if (!lastMessage || lastMessage.senderId === currentUserId || lastMessage.senderId === AI_ASSISTANT_ID) {
            setIsDrafting(false);
            // In a real app, use a toast/modal instead of console log for user feedback
            console.log("No message from the other person to draft a reply to.");
            return "Couldn't draft a reply.";
        }

        const otherUser = userProfiles[lastMessage.senderId]?.displayName || 'Contact';
        const currentUserDisplayName = userProfiles[currentUserId]?.displayName || 'Me';
        const systemPrompt = `You are a helpful assistant drafting a natural, friendly reply for a user named '${currentUserDisplayName}'. The response should be based on the last message received from '${otherUser}'. Write a short, single-sentence response. Do NOT use quotation marks. Only output the suggested reply text, without any introductory phrases.`;
        const userQuery = `The last message received was: "${lastMessage.text}". Suggest a friendly reply for '${currentUserDisplayName}'.`;
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${API_KEY}`;
        
        // 2. Call API (non-grounded)
        try {
            const payload = {
                contents: [{ parts: [{ text: userQuery }] }],
                systemInstruction: { parts: [{ text: systemPrompt }] },
            };

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            
            if (!response.ok) throw new Error("API call failed.");
            
            const result = await response.json();
            const draftedText = result.candidates?.[0]?.content?.parts?.[0]?.text || "That's a good question!";
            
            return draftedText.trim(); 
            
        } catch (error) {
            console.error("Drafting API Error:", error);
            return "Couldn't draft a reply.";
        } finally {
            setIsDrafting(false);
        }
    }, [db, currentUserId, userProfiles]);


    // --- FIREBASE INITIALIZATION AND AUTH STATE LISTENER (largely unchanged) ---
    useEffect(() => {
        if (!auth || !db) return;

        const handleInitialAuth = async () => {
            try {
                if (initialAuthToken) {
                    await signInWithCustomToken(auth, initialAuthToken);
                } else {
                    await signInAnonymously(auth);
                }
            } catch (e) {
                console.error("Initial auth failed:", e);
            }
        };

        const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
            if (currentUser) {
                setUser(currentUser);
                const userId = currentUser.uid;
                setCurrentUserId(userId);
                
                const userRef = doc(db, getCollectionPath('users'), userId);
                const userSnap = await getDoc(userRef);

                // 1. Ensure human user profile exists
                if (!userSnap.exists()) {
                    await setDoc(userRef, {
                        displayName: currentUser.displayName || `User_${currentUser.uid.substring(0, 4)}`,
                        photoURL: currentUser.photoURL || getProfilePicture(currentUser.displayName || currentUser.uid),
                        email: currentUser.email || null,
                        createdAt: serverTimestamp(),
                    });
                }
                
                // 2. Ensure AI Assistant profile exists
                const aiAssistantProfile = {
                    displayName: AI_ASSISTANT_NAME,
                    photoURL: AI_ASSISTANT_PHOTO,
                    email: 'assistant@cjc.ai',
                    isAI: true,
                    createdAt: serverTimestamp(),
                };

                const aiUserRef = doc(db, getCollectionPath('users'), AI_ASSISTANT_ID);
                const aiSnap = await getDoc(aiUserRef);

                if (!aiSnap.exists()) {
                    await setDoc(aiUserRef, aiAssistantProfile);
                    console.log("AI Assistant profile created/updated.");
                }

                // 3. Auto-create DM thread with AI Assistant if it doesn't exist
                const aiDmThreadId = getDmThreadId(userId, AI_ASSISTANT_ID);
                const aiDmThreadRef = doc(db, getCollectionPath('dmThreads'), aiDmThreadId);
                const aiDmSnap = await getDoc(aiDmThreadRef);

                if (!aiDmSnap.exists()) {
                    await setDoc(aiDmThreadRef, {
                        participants: [userId, AI_ASSISTANT_ID].sort(),
                        createdAt: serverTimestamp(),
                    });
                    console.log("DM thread with AI Assistant created.");
                }

            } else {
                setUser(null);
                setCurrentUserId(null);
            }
            setIsAuthReady(true);
        });

        handleInitialAuth();
        
        return () => unsubscribeAuth();
    }, []);


    // --- REAL-TIME DATA LISTENERS (unchanged) ---

    // Listener 1: All User Profiles
    useEffect(() => {
        if (!isAuthReady || !db) return;

        const usersRef = collection(db, getCollectionPath('users'));
        const unsubscribe = onSnapshot(usersRef, (snapshot) => {
            const profiles = {};
            snapshot.forEach(doc => {
                profiles[doc.id] = { id: doc.id, ...doc.data() };
            });
            setUserProfiles(profiles);
        }, (error) => console.error("Error fetching user profiles:", error));

        return () => unsubscribe();
    }, [isAuthReady]);

    // Listener 2: Chatrooms (Public)
    useEffect(() => {
        if (!isAuthReady || !currentUserId || !db) return;

        const chatroomsRef = collection(db, getCollectionPath('chatrooms'));
        const q = query(chatroomsRef);

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const rooms = snapshot.docs.map(doc => ({ id: doc.id, type: 'chatroom', ...doc.data() }));
            // Note: Currently filtering locally. For larger data sets, security rules are better.
            setChatrooms(rooms.filter(room => room.members?.includes(currentUserId) || room.ownerId === currentUserId));
        }, (error) => console.error("Error fetching chatrooms:", error));

        return () => unsubscribe();
    }, [currentUserId, isAuthReady]);

    // Listener 3: DM Threads (Filter by current user participation)
    useEffect(() => {
        if (!isAuthReady || !currentUserId || !db) return;

        const dmsRef = collection(db, getCollectionPath('dmThreads'));
        const q = query(dmsRef, where('participants', 'array-contains', currentUserId));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const threads = snapshot.docs.map(doc => ({ id: doc.id, type: 'dm', ...doc.data() }));
            setDmThreads(threads);
            
            // Check if the currently active chat is still valid/exists
            if (activeChat && activeChat.type === 'dm' && !threads.some(t => t.id === activeChat.id)) {
                setActiveChat(null);
            }

        }, (error) => console.error("Error fetching DM threads:", error));

        return () => unsubscribe();
    }, [currentUserId, isAuthReady]); 

    // --- CORE LOGIC FUNCTIONS ---

    const createChatroom = async (name) => {
        if (!db || !currentUserId) return;
        const newRoomRef = doc(collection(db, getCollectionPath('chatrooms')));
        
        await setDoc(newRoomRef, {
            name: name,
            ownerId: currentUserId,
            members: [currentUserId],
            createdAt: serverTimestamp(),
        });
        
        setActiveChat({ id: newRoomRef.id, type: 'chatroom', name: name, members: [currentUserId] });
    };

    const updateProfileData = async (userId, data) => {
        if (!db || !auth.currentUser) return;
        
        await updateProfile(auth.currentUser, { 
            displayName: data.displayName, 
            photoURL: data.photoURL 
        });

        const userRef = doc(db, getCollectionPath('users'), userId);
        await updateDoc(userRef, {
            displayName: data.displayName,
            photoURL: data.photoURL,
        });

        setUser(auth.currentUser);
    };

    const createDmThread = useCallback(async (targetUserIds) => {
        if (!db || !currentUserId || targetUserIds.length === 0) return;

        const allParticipants = [currentUserId, ...targetUserIds].sort();
        const numParticipants = allParticipants.length;

        if (numParticipants < 2) return; 

        let threadId;
        let dmThreadRef;
        let isNew = false;
        let activeThreadData = { type: 'dm', participants: allParticipants };

        if (numParticipants === 2) {
            // 1-on-1 DM: Use consistent ID
            threadId = getDmThreadId(currentUserId, targetUserIds[0]);
            dmThreadRef = doc(db, getCollectionPath('dmThreads'), threadId);
            const snap = await getDoc(dmThreadRef);
            isNew = !snap.exists();
        } else {
            // Group DM (N > 2): Find existing thread first by checking participants
            const existingThread = dmThreads.find(thread => {
                // Check if all participants match exactly (order doesn't matter due to sorting)
                return thread.participants.length === numParticipants &&
                       allParticipants.every(id => thread.participants.includes(id));
            });

            if (existingThread) {
                threadId = existingThread.id;
                dmThreadRef = doc(db, getCollectionPath('dmThreads'), threadId);
            } else {
                // Create a new document with auto-generated ID
                dmThreadRef = doc(collection(db, getCollectionPath('dmThreads')));
                threadId = dmThreadRef.id;
                isNew = true;
            }
        }
        
        activeThreadData.id = threadId;

        if (isNew) {
            await setDoc(dmThreadRef, {
                participants: allParticipants,
                createdAt: serverTimestamp(),
            });
        }
        
        // Find the newly created/existing chat in the live list and set as active
        const newChat = dmThreads.find(t => t.id === threadId) || activeThreadData;
        setActiveChat(newChat);

    }, [currentUserId, dmThreads]);

    const handleMessageSend = useCallback(async (chatId, chatType, messageData, participants) => {
        if (!db) return;
        
        let messagesCollectionPath;
        if (chatType === 'chatroom') {
            messagesCollectionPath = `chatrooms/${chatId}/messages`;
        } else if (chatType === 'dm') {
            messagesCollectionPath = `dmThreads/${chatId}/messages`;
        } else {
            console.error("Invalid chat type for sending message.");
            return;
        }

        const collectionPathSuffix = messagesCollectionPath;
        const messagesRef = collection(db, 'artifacts', appId, 'public', 'data', ...collectionPathSuffix.split('/'));

        await addDoc(messagesRef, messageData);

        // New AI Check: If it's a DM and the AI Assistant is a participant
        if (chatType === 'dm' && participants.includes(AI_ASSISTANT_ID) && participants.length === 2) {
            // The typing indicator is set in ChatArea, so just trigger the response
            handleAIResponse(chatId, messageData.text);
        }

    }, [db, handleAIResponse]);


    const handleDropdownSelect = (key) => {
        if (key === 'new_chatroom') {
            setIsCreateChatroomOpen(true);
        } else if (key === 'new_dm') {
            setUserSelectionMode('dm');
            setIsUserSelectionModalOpen(true);
        } else if (key === 'new_group') {
            setUserSelectionMode('group');
            setIsUserSelectionModalOpen(true);
        }
    };


    // --- UI HELPER FUNCTIONS ---

    const SidebarItem = ({ icon: Icon, text, onClick, isActive, isSpecial = false, isAI = false }) => (
        <button
            onClick={onClick}
            className={`w-full p-3 rounded-xl flex items-center transition duration-200 
                ${isActive ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-300 hover:bg-gray-700'} 
                ${isSpecial ? 'mt-4 border-t border-gray-700 pt-4' : ''}
                ${isAI ? 'text-cyan-400 hover:bg-cyan-900/50' : ''}
                `}
        >
            <Icon size={20} className="mr-3 flex-shrink-0" />
            <span className="truncate">{text}</span>
        </button>
    );

    // Dropdown menu options
    const dropdownOptions = [
        { key: 'new_dm', label: 'New 1:1 DM', icon: User },
        { key: 'new_group', label: 'New Group Chat', icon: Users },
        { key: 'new_chatroom', label: 'New Public Chatroom', icon: Zap },
    ];


    // --- RENDER ---

    if (!isAuthReady) {
        return (
            <div className="min-h-screen bg-gray-900 flex items-center justify-center text-white">
                <svg className="animate-spin h-8 w-8 text-indigo-500" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                <span className="ml-3">Loading Chatroom...</span>
            </div>
        );
    }

    if (!currentUserId || !user) {
        return <AuthView setUserId={setCurrentUserId} />;
    }

    const currentProfile = userProfiles[currentUserId] || { displayName: user.displayName || 'Me', photoURL: user.photoURL || getProfilePicture(user.displayName) };

    return (
        <div className="flex h-screen bg-gray-900 text-white">
            {/* Sidebar (Navigation) */}
            <div className="w-64 bg-gray-800 flex flex-col border-r border-gray-700 flex-shrink-0">
                
                {/* Header */}
                <div className="p-4 border-b border-gray-700 flex items-center justify-between">
                    <h1 className="text-2xl font-extrabold text-cyan-400">CJ's Chatroom <MessageCircle size={20} className="inline ml-1" /></h1>
                    {/* Replaced fixed "+" button with Dropdown */}
                    <Dropdown options={dropdownOptions} onSelect={handleDropdownSelect} />
                </div>

                {/* Chatroom List */}
                <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                    <h3 className="text-xs font-semibold uppercase text-gray-500 mb-2 flex items-center justify-between">
                        Chatrooms
                    </h3>
                    {chatrooms.map(room => (
                        <SidebarItem
                            key={room.id}
                            icon={Users}
                            text={room.name}
                            onClick={() => setActiveChat(room)}
                            isActive={activeChat?.id === room.id && activeChat.type === 'chatroom'}
                        />
                    ))}
                    {chatrooms.length === 0 && <p className='text-xs text-gray-600 italic'>No public chatrooms.</p>}
                </div>

                {/* DM List */}
                <div className="p-4 space-y-2 border-t border-gray-700 overflow-y-auto custom-scrollbar">
                    <h3 className="text-xs font-semibold uppercase text-gray-500 mb-2">Direct Messages</h3>
                    {dmThreads
                        .sort((a, b) => {
                            // Ensure AI Assistant is always at the top
                            const aIsAI = a.participants.includes(AI_ASSISTANT_ID) && a.participants.length === 2;
                            const bIsAI = b.participants.includes(AI_ASSISTANT_ID) && b.participants.length === 2;
                            if (aIsAI && !bIsAI) return -1;
                            if (!aIsAI && bIsAI) return 1;
                            return 0;
                        })
                        .map(dm => {
                        // Get participants other than me
                        const otherParticipants = dm.participants.filter(id => id !== currentUserId);
                        
                        let dmName = 'Loading DM...';
                        let Icon = MessageCircle;
                        let isAI = false;

                        if (otherParticipants.length === 1) {
                            const otherId = otherParticipants[0];
                            if (otherId === AI_ASSISTANT_ID) {
                                dmName = AI_ASSISTANT_NAME;
                                Icon = Bot;
                                isAI = true;
                            } else {
                                dmName = userProfiles[otherId]?.displayName || 'Direct Message';
                                Icon = User;
                            }
                        } else if (otherParticipants.length > 1) {
                            // Group DM
                            const names = otherParticipants.map(id => userProfiles[id]?.displayName || 'User').slice(0, 2);
                            dmName = names.join(', ') + (otherParticipants.length > 2 ? '...' : '');
                            Icon = Users;
                        }

                        return (
                            <SidebarItem
                                key={dm.id}
                                icon={Icon}
                                text={dmName}
                                onClick={() => setActiveChat(dm)}
                                isActive={activeChat?.id === dm.id && activeChat.type === 'dm'}
                                isAI={isAI}
                            />
                        );
                    })}
                    {dmThreads.length === 0 && <p className='text-xs text-gray-600 italic'>Use the + to start a chat.</p>}

                </div>

                {/* User Profile and Settings */}
                <div className="p-4 bg-gray-700/50 border-t border-gray-700 flex items-center justify-between">
                    <div className="flex items-center">
                        <img 
                            src={currentProfile.photoURL} 
                            alt={currentProfile.displayName}
                            className="w-10 h-10 rounded-full object-cover mr-3 border-2 border-indigo-500"
                            onError={(e) => { e.target.onerror = null; e.target.src = getProfilePicture(currentProfile.displayName); }}
                        />
                        <span className="font-semibold text-sm truncate max-w-[100px]">{currentProfile.displayName}</span>
                    </div>
                    <button 
                        onClick={() => setIsSettingsOpen(true)}
                        className='p-2 text-gray-400 hover:text-white hover:bg-gray-600 rounded-full transition'
                        title='Settings'
                    >
                        <Settings size={20} />
                    </button>
                </div>

            </div>

            {/* Main Chat Area */}
            <div className="flex-1 min-w-0">
                <ChatArea 
                    activeChat={activeChat} 
                    currentUserId={currentUserId} 
                    userProfiles={userProfiles} 
                    onMessageSend={handleMessageSend}
                    onSummarize={handleSummarizeChat}
                    onDraftReply={handleDraftReply}
                    summaryText={summaryText}
                    isSummarizing={isSummarizing}
                    isDrafting={isDrafting}
                />
            </div>

            {/* Modals */}
            <Modal 
                title="Application Settings" 
                isOpen={isSettingsOpen} 
                onClose={() => setIsSettingsOpen(false)}
            >
                <SettingsContent 
                    user={user} 
                    userProfile={currentProfile}
                    updateProfileData={updateProfileData}
                    onClose={() => setIsSettingsOpen(false)}
                />
            </Modal>
            
            <CreateChatroomModal
                isOpen={isCreateChatroomOpen}
                onClose={() => setIsCreateChatroomOpen(false)}
                createChatroom={createChatroom}
            />
            
            <UserSelectionModal
                isOpen={isUserSelectionModalOpen}
                onClose={() => setIsUserSelectionModalOpen(false)}
                userProfiles={userProfiles}
                currentUserId={currentUserId}
                mode={userSelectionMode}
                createDmThread={createDmThread}
                dmThreads={dmThreads}
            />

        </div>
    );
};

export default App;
