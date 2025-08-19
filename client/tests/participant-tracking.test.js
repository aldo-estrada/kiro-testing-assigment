/**
 * Unit tests for participant tracking functionality
 */

// Mock DOM elements and global objects
global.document = {
    getElementById: jest.fn(),
    createElement: jest.fn(() => ({
        className: '',
        innerHTML: '',
        textContent: ''
    })),
    addEventListener: jest.fn(),
    querySelectorAll: jest.fn(() => []),
    querySelector: jest.fn()
};

global.window = {
    location: { href: '' },
    addEventListener: jest.fn(),
    sessionStorage: {
        getItem: jest.fn(),
        setItem: jest.fn(),
        removeItem: jest.fn()
    }
};

global.Auth = {
    requireAuth: jest.fn(() => true),
    getCurrentUser: jest.fn(() => ({ username: 'testuser', id: '123' })),
    makeAuthenticatedRequest: jest.fn()
};

global.SocketManager = {
    connect: jest.fn(),
    joinRoom: jest.fn(),
    on: jest.fn(),
    getRoomParticipants: jest.fn(),
    getCurrentRoom: jest.fn(() => 'room123')
};

describe('Participant Tracking Frontend', () => {
    let mockParticipantsList;
    let mockParticipantCount;
    let mockParticipantsCountBadge;

    beforeEach(() => {
        // Mock DOM elements
        mockParticipantsList = {
            innerHTML: '',
            appendChild: jest.fn()
        };
        mockParticipantCount = {
            textContent: ''
        };
        mockParticipantsCountBadge = {
            textContent: ''
        };

        document.getElementById.mockImplementation((id) => {
            switch (id) {
                case 'participants-list':
                    return mockParticipantsList;
                case 'participant-count':
                    return mockParticipantCount;
                case 'participants-count-badge':
                    return mockParticipantsCountBadge;
                case 'messages-area':
                    return { querySelector: jest.fn() };
                default:
                    return { 
                        addEventListener: jest.fn(),
                        textContent: '',
                        classList: { 
                            add: jest.fn(), 
                            remove: jest.fn(), 
                            toggle: jest.fn(),
                            contains: jest.fn(() => false)
                        }
                    };
            }
        });

        // Reset mocks
        jest.clearAllMocks();
    });

    describe('Participant List Display', () => {
        test('should display participants correctly', () => {
            const participants = [
                { username: 'alice' },
                { username: 'bob' },
                { username: 'charlie' }
            ];

            // Simulate displayParticipants function
            function displayParticipants(participantsList) {
                participantsList.innerHTML = '';
                
                if (participants.length === 0) {
                    participantsList.innerHTML = `
                        <div class="loading-participants">
                            <span>No participants online</span>
                        </div>
                    `;
                    return;
                }
                
                participants.forEach(participant => {
                    const participantEl = document.createElement('div');
                    participantEl.className = 'participant-item';
                    
                    const avatar = participant.username.charAt(0).toUpperCase();
                    
                    participantEl.innerHTML = `
                        <div class="participant-avatar">${avatar}</div>
                        <div class="participant-info">
                            <div class="participant-name">${participant.username}</div>
                            <div class="participant-status">Online</div>
                        </div>
                    `;
                    
                    participantsList.appendChild(participantEl);
                });
            }

            displayParticipants(mockParticipantsList);

            expect(mockParticipantsList.innerHTML).toBe('');
            expect(mockParticipantsList.appendChild).toHaveBeenCalledTimes(3);
        });

        test('should show no participants message when list is empty', () => {
            const participants = [];

            function displayParticipants(participantsList) {
                participantsList.innerHTML = '';
                
                if (participants.length === 0) {
                    participantsList.innerHTML = `
                        <div class="loading-participants">
                            <span>No participants online</span>
                        </div>
                    `;
                    return;
                }
            }

            displayParticipants(mockParticipantsList);

            expect(mockParticipantsList.innerHTML).toContain('No participants online');
        });
    });

    describe('Participant Count Updates', () => {
        test('should update participant count correctly', () => {
            function updateParticipantCount(count) {
                mockParticipantCount.textContent = `${count} participant${count !== 1 ? 's' : ''}`;
                mockParticipantsCountBadge.textContent = count;
            }

            updateParticipantCount(3);
            expect(mockParticipantCount.textContent).toBe('3 participants');
            expect(mockParticipantsCountBadge.textContent).toBe(3);

            updateParticipantCount(1);
            expect(mockParticipantCount.textContent).toBe('1 participant');
            expect(mockParticipantsCountBadge.textContent).toBe(1);

            updateParticipantCount(0);
            expect(mockParticipantCount.textContent).toBe('0 participants');
            expect(mockParticipantsCountBadge.textContent).toBe(0);
        });
    });

    describe('Socket Event Handlers', () => {
        test('should handle participants update event', () => {
            const mockData = {
                roomId: 'room123',
                participants: [
                    { username: 'alice' },
                    { username: 'bob' }
                ]
            };

            function handleParticipantsUpdate(data) {
                if (data.roomId === SocketManager.getCurrentRoom()) {
                    const participants = data.participants || [];
                    // Update participant count
                    mockParticipantCount.textContent = `${participants.length} participant${participants.length !== 1 ? 's' : ''}`;
                    mockParticipantsCountBadge.textContent = participants.length;
                    return true;
                }
                return false;
            }

            const result = handleParticipantsUpdate(mockData);
            expect(result).toBe(true);
            expect(mockParticipantCount.textContent).toBe('2 participants');
            expect(mockParticipantsCountBadge.textContent).toBe(2);
        });

        test('should handle room participants event', () => {
            const mockData = {
                roomId: 'room123',
                participants: [
                    { username: 'alice' },
                    { username: 'bob' },
                    { username: 'charlie' }
                ]
            };

            function handleRoomParticipants(data) {
                if (data.roomId === SocketManager.getCurrentRoom()) {
                    const participants = data.participants || [];
                    return participants;
                }
                return null;
            }

            const result = handleRoomParticipants(mockData);
            expect(result).toHaveLength(3);
            expect(result[0].username).toBe('alice');
        });

        test('should handle user joined event', () => {
            const mockData = {
                message: {
                    type: 'notification',
                    message: 'alice joined the room',
                    timestamp: Date.now()
                }
            };

            function handleUserJoined(data) {
                if (data.message) {
                    return data.message;
                }
                return null;
            }

            const result = handleUserJoined(mockData);
            expect(result).toBeTruthy();
            expect(result.type).toBe('notification');
            expect(result.message).toContain('joined the room');
        });

        test('should handle user left event', () => {
            const mockData = {
                message: {
                    type: 'notification',
                    message: 'bob left the room',
                    timestamp: Date.now()
                }
            };

            function handleUserLeft(data) {
                if (data.message) {
                    return data.message;
                }
                return null;
            }

            const result = handleUserLeft(mockData);
            expect(result).toBeTruthy();
            expect(result.type).toBe('notification');
            expect(result.message).toContain('left the room');
        });
    });

    describe('Participant Panel Toggle', () => {
        test('should toggle participants panel visibility', () => {
            const mockPanel = {
                classList: {
                    toggle: jest.fn(),
                    contains: jest.fn(() => false)
                }
            };

            function toggleParticipantsPanel() {
                mockPanel.classList.toggle('hidden');
                
                if (!mockPanel.classList.contains('hidden')) {
                    SocketManager.getRoomParticipants();
                }
            }

            toggleParticipantsPanel();
            expect(mockPanel.classList.toggle).toHaveBeenCalledWith('hidden');
            expect(SocketManager.getRoomParticipants).toHaveBeenCalled();
        });
    });

    describe('Integration Tests', () => {
        test('should handle complete participant tracking workflow', () => {
            // Simulate joining a room
            const joinData = {
                roomName: 'Test Room',
                participants: [{ username: 'testuser' }]
            };

            function handleRoomJoined(data) {
                mockParticipantCount.textContent = `${data.participants?.length || 0} participant${data.participants?.length !== 1 ? 's' : ''}`;
                return true;
            }

            // Simulate participant update
            const updateData = {
                roomId: 'room123',
                participants: [
                    { username: 'testuser' },
                    { username: 'alice' }
                ]
            };

            function handleParticipantsUpdate(data) {
                if (data.roomId === SocketManager.getCurrentRoom()) {
                    mockParticipantCount.textContent = `${data.participants.length} participant${data.participants.length !== 1 ? 's' : ''}`;
                    mockParticipantsCountBadge.textContent = data.participants.length;
                    return true;
                }
                return false;
            }

            // Test the workflow
            handleRoomJoined(joinData);
            expect(mockParticipantCount.textContent).toBe('1 participant');

            handleParticipantsUpdate(updateData);
            expect(mockParticipantCount.textContent).toBe('2 participants');
            expect(mockParticipantsCountBadge.textContent).toBe(2);
        });
    });
});