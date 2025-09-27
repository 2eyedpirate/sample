
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static('public'));

// Store users with their locations
let users = {};

// Function to calculate distance between two points (in km)
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    
    // Handle location sharing
    socket.on('share location', (location) => {
        users[socket.id] = {
            location: location,
            username: 'User' + Math.floor(Math.random() * 1000),
            socketId: socket.id,
            lastSeen: new Date()
        };
        
        // Count nearby users
        const nearbyUsers = Object.values(users).filter(user => {
            if (user.socketId === socket.id) return false;
            return calculateDistance(
                location.lat, location.lng,
                user.location.lat, user.location.lng
            ) <= 10; // 10km radius
        });
        
        // Send proximity status to all nearby users
        Object.values(users).forEach(user => {
            const distance = calculateDistance(
                location.lat, location.lng,
                user.location.lat, user.location.lng
            );
            
            if (distance <= 10) {
                const nearbyCount = Object.values(users).filter(u => {
                    if (u.socketId === user.socketId) return false;
                    return calculateDistance(
                        user.location.lat, user.location.lng,
                        u.location.lat, u.location.lng
                    ) <= 10;
                }).length;
                
                io.to(user.socketId).emit('proximity status', {
                    nearbyUsers: nearbyCount,
                    radius: '10km'
                });
            }
        });
    });
    
    // Handle typing indicator
    socket.on('typing', (isTyping) => {
        const sender = users[socket.id];
        if (!sender) return;
        
        // Send typing status to nearby users
        Object.values(users).forEach(user => {
            const distance = calculateDistance(
                sender.location.lat, sender.location.lng,
                user.location.lat, user.location.lng
            );
            
            if (distance <= 10 && user.socketId !== socket.id) {
                io.to(user.socketId).emit('user typing', {
                    username: sender.username,
                    typing: isTyping
                });
            }
        });
    });
    
    // Handle chat messages - only send to nearby users
    socket.on('chat message', (msg) => {
        const sender = users[socket.id];
        if (!sender) return;
        
        const messageData = {
            username: sender.username,
            message: msg,
            timestamp: new Date().toLocaleTimeString(),
            id: Date.now()
        };
        
        // Find users within 10km and send message
        Object.values(users).forEach(user => {
            const distance = calculateDistance(
                sender.location.lat, sender.location.lng,
                user.location.lat, user.location.lng
            );
            
            if (distance <= 10) {
                io.to(user.socketId).emit('chat message', {
                    ...messageData,
                    distance: Math.round(distance * 100) / 100 + 'km away'
                });
            }
        });
    });
    
    // Handle message reactions
    socket.on('react to message', (data) => {
        const sender = users[socket.id];
        if (!sender) return;
        
        // Send reaction to nearby users
        Object.values(users).forEach(user => {
            const distance = calculateDistance(
                sender.location.lat, sender.location.lng,
                user.location.lat, user.location.lng
            );
            
            if (distance <= 10) {
                io.to(user.socketId).emit('message reaction', {
                    messageId: data.messageId,
                    reaction: data.reaction,
                    username: sender.username
                });
            }
        });
    });
    
    socket.on('disconnect', () => {
        delete users[socket.id];
        console.log('User disconnected:', socket.id);
        
        // Update proximity count for remaining users
        Object.values(users).forEach(user => {
            const nearbyCount = Object.values(users).filter(u => {
                if (u.socketId === user.socketId) return false;
                return calculateDistance(
                    user.location.lat, user.location.lng,
                    u.location.lat, u.location.lng
                ) <= 10;
            }).length;
            
            io.to(user.socketId).emit('proximity status', {
                nearbyUsers: nearbyCount,
                radius: '10km'
            });
        });
    });
});

server.listen(3000, () => {
    console.log('🌌 Proximity Chat running on localhost:3000');
});

