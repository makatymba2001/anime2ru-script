const express = require('express');
const path = require('path');
const {Client} = require('pg');
require('dotenv').config();
const PORT = process.env.PORT || 5000;
const bodyParser = require('body-parser');
const imgur = require('imgur');
const fetch = require('node-fetch')
const crypto = require('crypto');

imgur.setClientId(process.env.IMGUR_CLIENT_ID);
imgur.setAPIUrl('https://api.imgur.com/3/');

const app = express();
app.use(bodyParser.json({limit: '10mb'}));
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
app.get('/oldStyle', (req, res) => {
  res.setHeader('Content-Type', 'text/css');
  res.sendFile(__dirname + '/old.css')
})
app.get('/quickReply', (req, res) => {
  res.setHeader('Content-Type', 'text/css');
  res.sendFile(__dirname + '/quick.css')
})
app.get('/simpleMain', (req, res) => {
  res.setHeader('Content-Type', 'text/css');
  res.sendFile(__dirname + '/simple.css')
})
app.get('/stickyHeader', (req, res) => {
  res.setHeader('Content-Type', 'text/css');
  res.sendFile(__dirname + '/sticky.css')
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

// ------------------------------

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

// ------------------------------

let server_smiles_data = {};
function updateServerSmileData(){
  fetch('https://dota2.ru/replies/get_smiles').then(res => {
    return res.text()
  }).then(data => {
    if (data?.trim()?.startsWith('<')){
      setTimeout(updateServerSmileData, 5000)
    }
    else{
      Object.values(JSON.parse(data).smiles.smiles).flat().forEach(smile_data => {
        server_smiles_data[smile_data.id] = 'https://dota2.ru/img/forum/emoticons/' + smile_data.filename;
      })
    }
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

// ------------------------------

app.post('/authorize', (req, res) => {
  let b = req.body;
  if (!b.token && !b.password && !b.id){
    res.sendStatus(401);
    return;
  }
  let auth_token = b.token;
  let token = crypto.randomBytes(32).toString('hex') + Date.now().toString();
  if (auth_token){
    // Пользователь имеет токен? Проверить его на валидность и вернуть юзера
    client.query('SELECT id, threads_bg, thread_bg_br, thread_bg_position FROM AnimeUsers WHERE token = $1', [auth_token]).then(result => {
      result.rowCount ? res.send(result.rows[0]) : res.sendStatus(401);
    })
  }
  else{
    // Пользователь не имеет токен? Проверить по паролю и id
    let auth_password = null;
    if (b.password) auth_password = crypto.createHash('md5').update(b.password).digest('hex');
    let auth_id = Number(b.id);
    client.query('SELECT id, token, threads_bg, thread_bg_br, thread_bg_position FROM AnimeUsers WHERE password = $1 and id = $2 LIMIT 1', [auth_password, auth_id]).then(result => {
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

let register_buffer = {};
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
      client.query('INSERT INTO AnimeUsers (id, password, token, threads_bg, thread_bg_br, thread_bg_position, threads_bg_ignore) VALUES ($1, $2, $3, null, DEFAULT, DEFAULT, DEFAULT) RETURNING token', [auth_id, register_buffer[auth_id].password, register_buffer[auth_id].token])
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

// ------------------------------

app.post('/getThreadsBg', (req, res) => {
  let ids = req.body.ids || [];
  let self_id = req.body.id;
  const parser = (result, ignoring) => {
    let result_obj = {};
    let ignore_array = [];
    if (ignoring?.rows && ignoring?.rows[0]){
      ignore_array = ignoring.rows[0].threads_bg_ignore || [];
    }
    result.rows.forEach(elem => {
      let br = 1 - (elem.thread_bg_br / 100);
      result_obj[elem.id] = {
        bg: elem.threads_bg ? `background-image: linear-gradient(to left, rgba(38, 39, 44, ${br}), rgba(38, 39, 44, ${br})), url(${elem.threads_bg}); background-position-y: ${elem.thread_bg_position};` : null,
        ignored: ignore_array.includes(elem.id)
      }
    })
    res.send(result_obj)
  }
  if (!self_id){
    client.query('SELECT id, threads_bg, thread_bg_br, thread_bg_position FROM AnimeUsers WHERE array[id] && $1', [ids]).then(parser)
  }
  else{
    Promise.all([
      client.query(`SELECT id, threads_bg, thread_bg_br, thread_bg_position FROM AnimeUsers WHERE (array[id] && $1)`, [ids]),
      client.query(`SELECT threads_bg_ignore FROM AnimeUsers WHERE id = $1`, [self_id])
    ])
    .then(([result, ignoring]) => {
      parser(result, ignoring)
    })
  }
})

app.post('/updateThreadBg', (req, res) => {
  let auth_token = req.body.token;
  let br = req.body.br ?? 99999;
  let pos = req.body.pos || 99999;
  if (!Math.onRange(0, br, 100) || !Math.onRange(-3, Number(pos), 100)){
    res.sendStatus(400);
    return;
  }
  let pos_enum = {
    "-1": 'top',
    "-2": "center",
    "-3": "bottom"
  }
  pos = pos_enum[pos] || (pos + '%');
  client.query('SELECT * FROM AnimeUsers WHERE token = $1 LIMIT 1', [auth_token]).then(result => {
    if (!result.rowCount) {
      res.sendStatus(401);
      return;
    }
    if (req.body.data === null){
      client.query('UPDATE AnimeUsers SET (threads_bg, thread_bg_br, thread_bg_position) = ($1, DEFAULT, DEFAULT) WHERE token = $4', [null, auth_token]).then(result => {
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
        client.query('UPDATE AnimeUsers SET (threads_bg, thread_bg_br, thread_bg_position) = ($1, $2, $3) WHERE token = $4', [data.link, br, pos, auth_token]).then(result => {
          res.sendStatus(200);
        })
      })
    }
    else if (req.body.link){
      client.query('UPDATE AnimeUsers SET (threads_bg, thread_bg_br, thread_bg_position) = ($1, $2, $3) WHERE token = $4', [req.body.link, br, pos, auth_token]).then(result => {
        res.sendStatus(200);
      })
    }
    else{
      res.sendStatus(400);
    }
  })
})

app.post('/addThreadBgIgnore', (req, res) => {
  let auth_token = req.body.token;
  let t_id = req.body.id;
  if (t_id == -1) {
    res.sendStatus(400);
    return;
  }
  client.query('SELECT threads_bg_ignore FROM AnimeUsers WHERE token = $1 LIMIT 1', [auth_token]).then(result => {
    if (!result.rowCount){
      res.sendStatus(401);
      return;
    }
    if (result.rows[0].threads_bg_ignore.includes(t_id)){
      res.sendStatus(400);
      return;
    }
    client.query('UPDATE AnimeUsers SET threads_bg_ignore = array_append(threads_bg_ignore, $1) WHERE token = $2', [t_id, auth_token]).then(result => {
      res.sendStatus(200);
    })
  })
})

app.post('/removeThreadBgIgnore', (req, res) => {
  let auth_token = req.body.token;
  let t_id = req.body.id;
  client.query('SELECT id, threads_bg_ignore FROM AnimeUsers WHERE token = $1 LIMIT 1', [auth_token]).then(result => {
    if (!result.rowCount){
      res.sendStatus(401);
      return;
    }
    if (!result.rows[0].threads_bg_ignore.includes(t_id) || result.rows[0] === t_id){
      res.sendStatus(400);
      return;
    }
    client.query('UPDATE AnimeUsers SET threads_bg_ignore = array_remove(threads_bg_ignore, $1) WHERE token = $2', [t_id, auth_token]).then(result => {
      res.sendStatus(200);
    })
  })
})

// ------------------------------

app.post('/styles', (req, res) => {
  client.query('SELECT old_style, quick_reply, simple_main, sticky_header FROM AnimeUsers WHERE token = $1', [req.body.token], function(error, result){
    if (error) res.sendStatus(404);
    if (result) res.send(result.rows[0])
  })
})

app.post('/updateStyles', (req, res) => {
  let b = req.body;
  b.old_style = b.old_style === true ? true : false;
  b.quick_reply = b.quick_reply === true ? true : false;
  b.simple_main = b.simple_main === true ? true : false;
  b.sticky_header = b.sticky_header === true ? true : false;
  client.query('UPDATE AnimeUsers SET (old_style, quick_reply, simple_main, sticky_header) = ($1, $2, $3, $4) WHERE token = $5', [b.old_style, b.quick_reply, b.simple_main, b.sticky_header, b.token])
  .catch(e => {
    res.sendStatus(400);
  })
  .then(result => {
    if (!result.rowCount){
      res.sendStatus(403);
    }
    else{
      res.sendStatus(200);
    }
  })
})

// ------------------------------

updateServerSmileData();
setInterval(updateServerSmileData, 300000);

Math.onRange = (min, value, max) => {
  return value >= min && value <= max;
}