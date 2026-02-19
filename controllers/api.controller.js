const axios = require('axios');
const Room = require('../models/Room.model');
const Booking = require('../models/Booking.model');

// @desc    Get all rooms (JSON)
// @route   GET /api/v1/rooms
exports.getAllRooms = async (req, res) => {
    try {
        const rooms = await Room.find({ isActive: true }).select('-images');
        res.json({ success: true, count: rooms.length, data: rooms });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// @desc    Check Availability (Used by "Reserve" Button)
// @route   POST /api/v1/check-availability
exports.checkAvailability = async (req, res) => {
    try {
        const { roomId, checkIn, checkOut } = req.body;
        const newStart = new Date(checkIn);
        const newEnd = new Date(checkOut);

        // Universal Overlap Check
        const conflict = await Booking.findOne({
            room: roomId,
            status: { $in: ['pending', 'confirmed', 'completed'] },
            $and: [
                { checkInDate: { $lt: newEnd } },
                { checkOutDate: { $gt: newStart } }
            ]
        });

        if (conflict) {
            return res.json({ available: false, message: 'Selected dates are already booked.' });
        }

        res.json({ available: true });

    } catch (error) {
        res.status(500).json({ available: false, error: error.message });
    }
};

// @desc    Get 5-Day Weather Forecast (With Fallback)
// @route   GET /api/v1/weather
exports.getWeatherForecast = async (req, res) => {
    try {
        const lat = process.env.RESORT_LAT || '14.2155';
        const lon = process.env.RESORT_LON || '120.6037';
        const apiKey = process.env.OPENWEATHER_API_KEY;

        // 1. Try Fetching from API
        if (apiKey) {
            try {
                const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`;
                const response = await axios.get(url);
                const data = response.data;

                // Process Data
                const dailyForecast = [];
                const seenDates = new Set();

                data.list.forEach(item => {
                    const date = item.dt_txt.split(' ')[0];
                    const time = item.dt_txt.split(' ')[1];
                    
                    if (!seenDates.has(date) && (time === '12:00:00' || !dailyForecast.find(d => d.date === date))) {
                        seenDates.add(date);
                        dailyForecast.push({
                            date: new Date(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
                            temp: Math.round(item.main.temp),
                            description: item.weather[0].description,
                            icon: `https://openweathermap.org/img/wn/${item.weather[0].icon}@2x.png`
                        });
                    }
                });

                return res.json(dailyForecast.slice(0, 5));

            } catch (apiError) {
                console.error("OpenWeatherMap API Failed (Using Fallback):", apiError.response ? apiError.response.status : apiError.message);
                // Fall through to mock data...
            }
        }

        // 2. Fallback Mock Data (If API Key fails or missing)
        // This ensures your UI never breaks
        const mockData = [];
        const today = new Date();
        
        for(let i=0; i<5; i++) {
            const nextDay = new Date(today);
            nextDay.setDate(today.getDate() + i);
            
            mockData.push({
                date: nextDay.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
                temp: 28 + Math.floor(Math.random() * 4), // Random temp 28-32
                description: i === 0 ? "sunny" : (i === 2 ? "partly cloudy" : "clear sky"),
                icon: i === 2 ? "https://openweathermap.org/img/wn/02d@2x.png" : "https://openweathermap.org/img/wn/01d@2x.png"
            });
        }

        return res.json(mockData);

    } catch (error) {
        console.error("Weather Controller Critical Error:", error.message);
        res.status(500).json([]);
    }
};