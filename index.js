const express = require('express');
const path = require('path');
const {Client} = require('pg');
require('dotenv').config();
const PORT = process.env.PORT || 5000;
const bodyParser = require('body-parser');
const imgur = require('imgur');
const fetch = require('node-fetch')

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
  if (req.headers.cookie !== process.env.ADMIN_TOKEN) {
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
  if (req.headers.cookie !== process.env.ADMIN_TOKEN) {
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
  client.query('SELECT * FROM AnimeUsers WHERE token = $1', [auth_token]).then(result => {
    if (!result.rowCount) {
      res.sendStatus(401);
      return;
    }
    if (req.body.data === null){
      client.query('UPDATE AnimeUsers SET thread_bg = $1 WHERE token = $2', [null, auth_token]).then(result => {
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
        client.query('UPDATE AnimeUsers SET thread_bg = $1 WHERE token = $2', [data.link, auth_token]).then(result => {
          res.sendStatus(200);
        })
      })
    }
    else if (req.body.link){
      client.query('UPDATE AnimeUsers SET thread_bg = $1 WHERE token = $2', [req.body.link, auth_token]).then(result => {
        res.sendStatus(200);
      })
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

app.post('/authorize', (req, res) => {
  let auth_token = req.body.token;
  let auth_id = Number(req.body.id);
  if (!auth_token){
    res.sendStatus(401);
    return;
  }
  client.query('SELECT * FROM AnimeUsers WHERE token = $1 and id = $2', [auth_token, auth_id]).then(result => {
    if (!result.rowCount){
      client.query('INSERT INTO AnimeUsers (id, token, thread_bg, best_smiles) VALUES ($1, $2, null, $3) RETURNING *', [auth_id, auth_token, []]).then(result => {
        res.send(result.rows[0])
        }
      )
    }
    else{
      res.send(result.rows[0])
    }
  })
})
app.post('/getThreadsBg', (req, res) => {
  let ids = req.body.ids;
  client.query('SELECT id, thread_bg FROM AnimeUsers WHERE array[id] && $1', [ids]).then(result => {
    let result_obj = {};
    result.rows.forEach(elem => {
      result_obj[elem.id] = elem.thread_bg;
    })
    res.send(result_obj)
  })
})
updateServerSmileData();
setInterval(updateServerSmileData, 300000);