const lqip = require('lqip');

const file = process.argv[2];

console.log(file);

lqip.base64(file).then(res => {
    console.log(res); // "data:image/jpeg;base64,/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhY.....
});

// install https://www.npmjs.com/package/lqip
// npm install --save lqip

// command
// node gen_lqip.js /path/to/image