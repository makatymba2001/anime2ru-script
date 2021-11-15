const express = require('express');
const path = require('path');
const {Client} = require('pg');
require('dotenv').config();
const PORT = process.env.PORT || 5000;
const bodyParser = require('body-parser');
const imgur = require('imgur');
const fetch = require('node-fetch')
const crypto = require('crypto');
const {XMLHttpRequest} = require('xmlhttprequest');

imgur.setClientId(process.env.IMGUR_CLIENT_ID);
imgur.setAPIUrl('https://api.imgur.com/3/');

// imgur.uploadUrl(d, null, (Date.now()).toString())

const app = express();
app.use(bodyParser.json({limit: '50mb'}));
app.use(express.static(path.join(__dirname, 'static')))
app.set('views', path.join(__dirname, 'static'))
app.set('view engine', 'ejs')

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

client.connect();

app.listen(PORT, () => console.log(`Listening on ${ PORT }`));

app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept".toLowerCase());
  next();
});

app.get('/script', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.sendFile(__dirname + '/local.js')
})
app.get('/style', (req, res) => {
  res.setHeader('Content-Type', 'text/css');
  res.sendFile(__dirname + '/local.css')
})

app.get('/settingsIcon', (req, res) => {
  res.setHeader('Content-Header', 'application/svg+xml');
  res.sendFile(__dirname + '/static/images/settings.svg');
})

app.post('/database-request', (req, res) => {
  if (req.headers.cookie === process.env.ADMIN_TOKEN) {
    client.query(req.body.query, (error, result) => {
      if (error) {
          res.send({__error__: error.message})
      }
      else if (result) {
          delete result._types;
          res.send(result);
      } 
    })
  }
  else{
    res.sendStatus(403)
  }
})
app.get('/database', (req, res) => {
  if (req.headers.cookie === process.env.ADMIN_TOKEN) {
    res.render('pages/database');
  }
  else{
    res.sendStatus(403)
  }
})

app.post('/uploadImage', (req, res) => {
  imgur.uploadBase64(req.body.data.substring(req.body.data.indexOf(',') + 1), null, (Date.now()).toString())
  .catch(e => {
    res.sendStatus(500);
  })
  .then(data => {
    if (!data) return;
    res.send(data.link)
  })
})
app.post('/updateThreadBg', (req, res) => {
  let auth_token = req.body.token;
  client.query('SELECT * FROM AnimeUsers WHERE token = $1 LIMIT 1', [auth_token]).then(result => {
    if (!result.rowCount) {
      res.sendStatus(401);
      return;
    }
    if (req.body.data === null){
      client.query('UPDATE AnimeUsers SET threads_bg = $1 WHERE token = $2', [null, auth_token]).then(result => {
        res.sendStatus(200);
      })
    }
    if (req.body.data){
      imgur.uploadBase64(req.body.data.substring(req.body.data.indexOf(',') + 1), null, (Date.now()).toString())
      .catch(e => {
        res.sendStatus(500);
      })
      .then(data => {
        if (!data) return;
        client.query('UPDATE AnimeUsers SET threads_bg = $1 WHERE token = $2', [data.link, auth_token]).then(result => {
          res.sendStatus(200);
        })
      })
    }
    else if (req.body.link){
      client.query('UPDATE AnimeUsers SET threads_bg = $1 WHERE token = $2', [req.body.link, auth_token]).then(result => {
        res.sendStatus(200);
      })
    }
    else{
      res.sendStatus(400);
    }
  })
})

let server_smiles_data = {};
function updateServerSmileData(){
  fetch('https://dota2.ru/replies/get_smiles').then(res => {return res.json()}).then(data => {
    Object.values(data.smiles.smiles).flat().forEach(smile_data => {
      server_smiles_data[smile_data.id] = 'https://dota2.ru/img/forum/emoticons/' + smile_data.filename;
    })
  })
}

app.get(/\/smile/, (req, res) => {
  let match = req.url.match(/\/smile\/([0-9]+)(\/|$)/);
  if (match && server_smiles_data[match[1]]){
    res.redirect(server_smiles_data[match[1]])
  } else {
    res.sendStatus(404);
  }
})
let register_buffer = {};
app.post('/authorize', (req, res) => {
  let b = req.body;
  if (!b.token && !b.password && !b.id){
    res.sendStatus(400);
    return;
  }
  let auth_password = null;
  if (b.password) auth_password = crypto.createHash('md5').update(b.password).digest('hex');
  let auth_id = Number(b.id);
  let auth_token = b.token;
  let token = crypto.randomBytes(32).toString('hex') + Date.now().toString();
  if (auth_token){
    // Пользователь имеет токен? Проверить его на валидность и вернуть юзера
    client.query('SELECT id FROM AnimeUsers WHERE token = $1', [auth_token]).then(result => {
      result.rowCount ? res.send({id: result.rows[0].id}) : res.sendStatus(401);
    })
  }
  else{
    // Пользователь не имеет токен? Проверить по паролю и id
    client.query('SELECT id, token FROM AnimeUsers WHERE password = $1 and id = $2 LIMIT 1', [auth_password, auth_id]).then(result => {
      if (!result.rowCount){
        // Начать регистрацию
        register_buffer[auth_id] = {password: auth_password, token: token};
        res.send({need_confirm: true});
      }
      else{
        // Авторизован по id и паролю
        res.send(result.rows[0])
      }
    })
  }
})

app.post('/confirmRegister', (req, res) => {
  let auth_id = req.body.id;
  let headers = new fetch.Headers();
  headers.append('Content-Type', 'application/json');
  headers.append("X-Requested-With", "XMLHttpRequest");
  fetch("https://dota2.ru/forum/api/forum/showPostRates", {method: "POST", headers: headers, body: JSON.stringify({pid: 26000919, smile_id: "1538"})})
  .catch(e => {
    res.sendStatus(500)
  })
  .then(r => { if (r) return r.text()})
  .then(data => {
    if (data.includes('/' + auth_id + '.')){
      // Регистрация пройдена
      client.query('INSERT INTO AnimeUsers (id, password, token, threads_bg) VALUES ($1, $2, $3, null) RETURNING token', [auth_id, register_buffer[auth_id].password, register_buffer[auth_id].token])
      .catch(e => {
        res.sendStatus(403);
      })
      .then(result => {
        if (!result) return;
        res.send(result.rows[0])
      })
    }
    else{
      // Регистрация не пройдена
      res.sendStatus(404);
    }
  })
})

app.post('/getThreadsBg', (req, res) => {
  let ids = req.body.ids;
  client.query('SELECT id, threads_bg FROM AnimeUsers WHERE array[id] && $1', [ids]).then(result => {
    let result_obj = {};
    result.rows.forEach(elem => {
      result_obj[elem.id] = elem.threads_bg;
    })
    res.send(result_obj)
  })
})

app.post('/changePassword', (req, res) => {
  let b = req.body;
  if (!b.old_password || !b.new_password || !b.token){
    res.sendStatus(401);
    return;
  }
  let old_p = crypto.createHash('md5').update(b.old_password).digest('hex');
  let new_p = crypto.createHash('md5').update(b.new_password).digest('hex');
  client.query('SELECT * FROM AnimeUsers WHERE token = $1 and password = $2 LIMIT 1', [b.token, old_p]).then(result => {
    if (!result.rowCount){
      res.sendStatus(404);
      return;
    }
    client.query('UPDATE AnimeUsers set password = $1 WHERE token = $2 and password = $3', [new_p, b.token, old_p]).then(result => {
      res.sendStatus(200);
    })
  });
})

updateServerSmileData();
setInterval(updateServerSmileData, 300000);