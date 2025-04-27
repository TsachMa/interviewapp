/**
 * Chat History Manager - Handles all chat history related functionality
 */
class ChatHistoryManager {
    constructor(options) {
        // DOM elements
        this.chatHistoryElement = options.chatHistoryElement;
        this.clearHistoryButton = options.clearHistoryButton;
        
        // Callback functions
        this.onPhaseChange = options.onPhaseChange || function() {};
        
        // State
        this.displayedChatHistory = [];
        
        // Bind event listeners
        if (this.clearHistoryButton) {
            this.clearHistoryButton.addEventListener('click', () => this.clearChatHistory());
        }
        
        // Initialize
        this.loadChatHistory();
    }
    
    /**
     * Adds a message to the displayed chat history
     * @param {string} role - The role of the speaker ('user' or 'assistant')
     * @param {string} text - The message text
     * @returns {Object} The created message object
     */
    addMessage(role, text) {
        // Create a new message object
        const message = {
            role: role,
            text: text,
            timestamp: new Date().toISOString()
        };
        
        // Add to the displayed chat history array
        this.displayedChatHistory.push(message);
        
        // Update the chat history display
        this.updateChatHistoryDisplay();
        
        // Save to localStorage
        this.saveChatHistory();
        
        // Check if the message signals a phase change (if it's from the assistant)
        if (role === 'assistant' && 
            text.includes("You can start coding now. I'll only respond to direct questions from this point on.")) {
            this.onPhaseChange('coding');
        }
        
        return message;
    }
    
    /**
     * Updates the chat history display in the DOM
     */
    updateChatHistoryDisplay() {
        if (!this.chatHistoryElement) return;
        
        // Clear the current display
        this.chatHistoryElement.innerHTML = '';
        
        // Add each message to the display
        this.displayedChatHistory.forEach(message => {
            const messageDiv = document.createElement('div');
            messageDiv.className = `chat-message ${message.role === 'user' ? 'user-message' : 'assistant-message'}`;
            
            // Create header with role and timestamp
            const header = document.createElement('div');
            header.className = 'message-header small text-muted';
            
            // Format the timestamp
            const timestamp = new Date(message.timestamp);
            const timeString = timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            
            header.textContent = `${message.role === 'user' ? 'You' : 'Interviewer'} - ${timeString}`;
            
            // Create content
            const content = document.createElement('div');
            content.className = 'message-content';
            content.textContent = message.text;
            
            // Add header and content to message
            messageDiv.appendChild(header);
            messageDiv.appendChild(content);
            
            // Add message to chat history
            this.chatHistoryElement.appendChild(messageDiv);
        });
        
        // Scroll to the bottom
        this.chatHistoryElement.scrollTop = this.chatHistoryElement.scrollHeight;
    }
    
    /**
     * Saves chat history to localStorage
     */
    saveChatHistory() {
        localStorage.setItem('interviewChatHistory', JSON.stringify(this.displayedChatHistory));
    }
    
    /**
     * Loads chat history from localStorage
     */
    loadChatHistory() {
        const savedHistory = localStorage.getItem('interviewChatHistory');
        if (savedHistory) {
            this.displayedChatHistory = JSON.parse(savedHistory);
            this.updateChatHistoryDisplay();
            
            // Check if we need to detect phase change
            const phaseChangeIndex = this.displayedChatHistory.findIndex(msg => 
                msg.role === 'assistant' && 
                msg.text.includes("You can start coding now. I'll only respond to direct questions from this point on.")
            );
            
            if (phaseChangeIndex !== -1) {
                this.onPhaseChange('coding');
            }
        }
    }
    
    /**
     * Clears the chat history
     */
    clearChatHistory() {
        // Clear the chat history array
        this.displayedChatHistory = [];
        
        // Update the display
        this.updateChatHistoryDisplay();
        
        // Clear from localStorage
        localStorage.removeItem('interviewChatHistory');
        
        // Reset phase to clarification
        this.onPhaseChange('clarification');
    }
    
    /**
     * Gets all chat history messages
     * @returns {Array} The chat history array
     */
    getAllMessages() {
        return this.displayedChatHistory;
    }
    
    /**
     * Gets the chat history count
     * @returns {number} The number of messages
     */
    getMessageCount() {
        return this.displayedChatHistory.length;
    }
    
    /**
     * Creates a new ChatHistoryManager instance
     * @param {Object} options - Configuration options
     * @returns {ChatHistoryManager} A new ChatHistoryManager instance
     */
    static init(options) {
        return new ChatHistoryManager(options);
    }
}

// Export as a global if in browser environment
if (typeof window !== 'undefined') {
    window.ChatHistoryManager = { init: ChatHistoryManager.init };
}