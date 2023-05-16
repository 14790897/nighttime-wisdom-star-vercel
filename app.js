const express = require('express');
const bodyParser = require('body-parser');
const redis = require('redis');
const bcrypt = require('bcrypt');
const dotenv = require('dotenv');
const flash = require('connect-flash');
const { check, validationResult } = require('express-validator');
const path = require('path');
const session = require('express-session');


dotenv.config();

const app = express();
const client = redis.createClient({
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
    password: process.env.REDIS_PASSWORD,
});
client.on('error', function(err) {
    console.error('Error connecting to Redis:', err);
});

app.use(session({
    secret: process.env.SECRET_KEY,
    resave: false,
    saveUninitialized: true
}));

app.use(bodyParser.urlencoded({ extended: true }));
app.use(flash());
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'))


app.get('/home', (req, res) => {
    res.render('home', { messages: req.flash(), username: req.session.username, history: req.session.history || [] });
});

app.post('/home', (req, res) => {
    const inputData = req.body.input_data;
    if (req.session.username) {
        const username = req.session.username;
        const dataKey = `${username}:data`;
        client.lpush(dataKey, inputData, (err) => {
            if (err) {
                console.error(err);
                req.flash('error', 'Failed to submit data.');
            } else {
                req.flash('success', 'Data submitted successfully.');
            }
            res.redirect('/home');
        });
    } else {
        req.flash('warning', 'Please log in to submit data.');
        res.redirect('/login');
    }
    let history = [];
    if (req.session.username) {
        client.lrange(`${req.session.username}:results`, 0, -1, (err, reply) => {
            if (err) {
                console.error(err);
            } else {
                history = reply;
                res.render('home', { history });
            }
        });
    }
});

app.get('/login', (req, res) => {
    res.render('login');
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    client.get(username, (err, reply) => {
        if (err) {
            console.error(err);
        } else if (reply && bcrypt.compareSync(password, reply)) {
            req.session.username = username;
            res.redirect('/home');
        } else {
            res.redirect('/login');
        }
    });
});

app.get('/register', (req, res) => {
    res.render('register', { errors: [] });
});


app.post('/register', [
    check('password').isLength({ min: 5 }),
    check('confirm_password').custom((value, { req }) => {
        if (value !== req.body.password) {
            throw new Error('Password confirmation does not match password');
        }
        return true;
    })
], (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        res.render('register', { errors: errors.array() });
    } else {
        const { username, password } = req.body;
        client.exists(username, (err, reply) => {
            if (err) {
                console.error(err);
            } else if (reply === 0) {
                const hashedPassword = bcrypt.hashSync(password, 10);
                client.set(username, hashedPassword, redis.print);
                res.redirect('/login');
            } else {
                res.redirect('/register');
                //提示用户已存在
            }
        });
    }
});



app.listen(process.env.PORT || 3000, () => {
    console.log('Server is running...');
});
