const express = require('express');
const path = require('path');
const {Client} = require('pg');
require('dotenv').config();
const PORT = process.env.PORT || 5000;
const bodyParser = require('body-parser');
const imgur = require('imgur');
const fetch = require('node-fetch')
const crypto = require('crypto');
const fs = require('fs');

imgur.setClientId(process.env.IMGUR_CLIENT_ID);
imgur.setAPIUrl('https://api.imgur.com/3/');

const app = express();
app.use(bodyParser.json({limit: '10mb'}));
app.use(express.static(path.join(__dirname, 'static')));
app.set('views', path.join(__dirname, 'static'));
app.set('view engine', 'ejs');

let local_css = fs.readFileSync('./local.css', {encoding: 'utf-8'});
local_css =  local_css.replace(/    /g, '').replace(/\s{2,}/g, '');
let old_css = fs.readFileSync('./old.css', {encoding: 'utf-8'});
old_css =  old_css.replace(/    /g, '').replace(/\s{2,}/g, '');
let quick_css = fs.readFileSync('./quick.css', {encoding: 'utf-8'});
quick_css =  quick_css.replace(/    /g, '').replace(/\s{2,}/g, '');
let simple_css = fs.readFileSync('./simple.css', {encoding: 'utf-8'});
simple_css =  simple_css.replace(/    /g, '').replace(/\s{2,}/g, '');
let sticky_css = fs.readFileSync('./sticky.css', {encoding: 'utf-8'});
sticky_css =  sticky_css.replace(/    /g, '').replace(/\s{2,}/g, '');

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

// ------------------------------

app.get('/script', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.sendFile(__dirname + '/local.js')
})
app.get('/base_style', (req, res) => {
  res.status(200).send(local_css)
})
app.get('/old_style', (req, res) => {
  res.status(200).send(old_css)
})
app.get('/quick_reply', (req, res) => {
  res.status(200).send(quick_css)
})
app.get('/simple_main', (req, res) => {
  res.status(200).send(simple_css)
})
app.get('/sticky_header', (req, res) => {
  res.status(200).send(sticky_css)
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

// ------------------------------

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
  if (!req.body){
    res.sendStatus(400);
    return;
  }
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
  if (!req.body || !req.body.mode){
    res.sendStatus(400);
    return;
  }
  let b = req.body;
  if (!b.token && !b.password && !b.id){
    res.sendStatus(401);
    return;
  }
  let auth_token = b.token;
  if (auth_token){
    // Пользователь имеет токен? Проверить его на валидность и вернуть юзера
    client.query(`SELECT id, threads_bg, thread_bg_br, thread_bg_position, custom_smile_sections FROM ${getTable(req.body.mode)} WHERE token = $1`, [auth_token]).then(result => {
      result.rowCount ? res.send(result.rows[0]) : res.sendStatus(401);
    })
  }
  else{
    // Пользователь не имеет токен? Проверить по паролю и id
    let auth_password = null;
    if (b.password) auth_password = crypto.createHash('md5').update(b.password).digest('hex');
    let auth_id = Number(b.id);
    client.query(`SELECT id, token, threads_bg, thread_bg_br, thread_bg_position, custom_smile_sections FROM ${getTable(req.body.mode)} WHERE password = $1 and id = $2 LIMIT 1`, [auth_password, auth_id]).then(result => {
      result.rowCount ? res.send(result.rows[0]) : res.sendStatus(404);
    })
  }
})

app.post('/registerUser', (req, res) => {
  if (!req.body || req.body.password.length < 2 || !req.body.mode){
    res.sendStatus(400);
    return;
  }
  let auth_id = Number(req.body.id);
  let auth_password = crypto.createHash('md5').update(req.body.password).digest('hex');
  let token = crypto.randomBytes(32).toString('hex') + Date.now().toString();
  let headers = new fetch.Headers();
  headers.append('Content-Type', 'application/json');
  headers.append("X-Requested-With", "XMLHttpRequest");
  let verif_object;
  if (req.body.mode === "dota2.ru") {
    verif_object = {pid: 26000919, smile_id: "1538"};
    fetch("https://dota2.ru/forum/api/forum/showPostRates", {method: "POST", headers: headers, body: JSON.stringify(verif_object)})
    .catch(e => {
      res.sendStatus(500)
    })
    .then(r => { if (r) return r.text()})
    .then(data => {
      if (data.includes('/' + auth_id + '.')){
        // Регистрация пройдена
        client.query(`INSERT INTO ${getTable(req.body.mode)} (id, password, token, threads_bg, thread_bg_br, thread_bg_position, threads_bg_ignore) VALUES ($1, $2, $3, null, DEFAULT, DEFAULT, DEFAULT) RETURNING token`, [auth_id, auth_password, token])
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
  }
  else if (req.body.mode === "esportsgames.ru"){
    // Регистрация пройдена
    client.query(`INSERT INTO ${getTable(req.body.mode)} (id, password, token, threads_bg, thread_bg_br, thread_bg_position, threads_bg_ignore) VALUES ($1, $2, $3, null, DEFAULT, DEFAULT, DEFAULT) RETURNING token`, [auth_id, auth_password, token])
    .catch(e => {
      res.sendStatus(403);
    })
    .then(result => {
      if (!result) return;
      res.send(result.rows[0])
    })
  }
})

app.post('/changePassword', (req, res) => {
  if (!req.body || !req.body.mode){
    res.sendStatus(400);
    return;
  }
  let b = req.body;
  if (!b.old_password || !b.new_password || !b.token){
    res.sendStatus(401);
    return;
  }
  let old_p = crypto.createHash('md5').update(b.old_password).digest('hex');
  let new_p = crypto.createHash('md5').update(b.new_password).digest('hex');
  client.query(`SELECT * FROM ${getTable(req.body.mode)} WHERE token = $1 and password = $2 LIMIT 1`, [b.token, old_p]).then(result => {
    if (!result.rowCount){
      res.sendStatus(404);
      return;
    }
    client.query(`UPDATE ${getTable(req.body.mode)} set password = $1 WHERE token = $2 and password = $3`, [new_p, b.token, old_p]).then(result => {
      res.sendStatus(200);
    })
  });
})

// ------------------------------

app.post('/getThreadsBg', (req, res) => {
  if (!req.body || !req.body.mode){
    res.sendStatus(400);
    return;
  }
  let ids = req.body.ids || [];
  let self_id = req.body.id;
  const parser = (result, ignoring) => {
    let result_obj = {};
    let ignore_array = [];
    if (ignoring?.rows && ignoring?.rows[0]){
      ignore_array = ignoring.rows[0].threads_bg_ignore || [];
    }
    result.rows.forEach(elem => {
      result_obj[elem.id] = {
        bg: elem.threads_bg ? `background-image: linear-gradient(to left, rgba(38, 39, 44, ${elem.thread_bg_br / 100}), rgba(38, 39, 44, ${elem.thread_bg_br / 100})), url(${elem.threads_bg}); background-position-y: ${elem.thread_bg_position}%;` : null,
        ignored: ignore_array.includes(elem.id)
      }
    })
    res.send(result_obj)
  }
  if (!self_id){
    client.query(`SELECT id, threads_bg, thread_bg_br, thread_bg_position FROM ${getTable(req.body.mode)} WHERE array[id] && $1`, [ids]).then(parser)
  }
  else{
    Promise.all([
      client.query(`SELECT id, threads_bg, thread_bg_br, thread_bg_position FROM ${getTable(req.body.mode)} WHERE (array[id] && $1)`, [ids]),
      client.query(`SELECT threads_bg_ignore FROM ${getTable(req.body.mode)} WHERE id = $1`, [self_id])
    ])
    .then(([result, ignoring]) => {
      parser(result, ignoring)
    })
  }
})

app.post('/updateThreadBg', (req, res) => {
  if (!req.body || !req.body.mode){
    res.sendStatus(400);
    return;
  }
  let auth_token = req.body.token;
  let br = req.body.br ?? 99999;
  let pos = req.body.pos ?? 99999;
  if (!Math.onRange(0, br, 100) || !Math.onRange(0, pos, 100)){
    res.sendStatus(400);
    return;
  }
  client.query(`SELECT * FROM ${getTable(req.body.mode)} WHERE token = $1 LIMIT 1`, [auth_token]).then(result => {
    if (!result.rowCount) {
      res.sendStatus(401);
      return;
    }
    if (req.body.data === null){
      client.query(`UPDATE ${getTable(req.body.mode)} SET (threads_bg, thread_bg_br, thread_bg_position) = ($1, DEFAULT, DEFAULT) WHERE token = $4`, [null, auth_token]).then(result => {
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
        client.query(`UPDATE ${getTable(req.body.mode)} SET (threads_bg, thread_bg_br, thread_bg_position) = ($1, $2, $3) WHERE token = $4`, [data.link, br, pos, auth_token]).then(result => {
          res.sendStatus(200);
        })
      })
    }
    else if (req.body.link){
      client.query(`UPDATE ${getTable(req.body.mode)} SET (threads_bg, thread_bg_br, thread_bg_position) = ($1, $2, $3) WHERE token = $4`, [req.body.link, br, pos, auth_token]).then(result => {
        res.sendStatus(200);
      })
    }
    else{
      res.sendStatus(400);
    }
  })
})

app.post('/addThreadBgIgnore', (req, res) => {
  if (!req.body || !req.body.mode){
    res.sendStatus(400);
    return;
  }
  let auth_token = req.body.token;
  let t_id = req.body.id;
  if (t_id == -1) {
    res.sendStatus(400);
    return;
  }
  client.query(`SELECT threads_bg_ignore FROM ${getTable(req.body.mode)} WHERE token = $1 LIMIT 1`, [auth_token]).then(result => {
    if (!result.rowCount){
      res.sendStatus(401);
      return;
    }
    if (result.rows[0].threads_bg_ignore.includes(t_id)){
      res.sendStatus(400);
      return;
    }
    client.query(`UPDATE ${getTable(req.body.mode)} SET threads_bg_ignore = array_append(threads_bg_ignore, $1) WHERE token = $2`, [t_id, auth_token]).then(result => {
      res.sendStatus(200);
    })
  })
})

app.post('/removeThreadBgIgnore', (req, res) => {
  if (!req.body || !req.body.mode){
    res.sendStatus(400);
    return;
  }
  let auth_token = req.body.token;
  let t_id = req.body.id;
  client.query(`SELECT id, threads_bg_ignore FROM ${getTable(req.body.mode)} WHERE token = $1 LIMIT 1`, [auth_token]).then(result => {
    if (!result.rowCount){
      res.sendStatus(401);
      return;
    }
    if (!result.rows[0].threads_bg_ignore.includes(t_id) || result.rows[0] === t_id){
      res.sendStatus(400);
      return;
    }
    client.query(`UPDATE ${getTable(req.body.mode)} SET threads_bg_ignore = array_remove(threads_bg_ignore, $1) WHERE token = $2`, [t_id, auth_token]).then(result => {
      res.sendStatus(200);
    })
  })
})

// ------------------------------

app.post('/styles', (req, res) => {
  if (!req.body || !req.body.mode){
    res.sendStatus(400);
    return;
  }
  client.query(`SELECT old_style, quick_reply, simple_main, sticky_header FROM ${getTable(req.body.mode)} WHERE token = $1`, [req.body.token], function(error, result){
    if (error) res.sendStatus(404);
    if (result) res.send(result.rows[0])
  })
})

app.post('/updateStyles', (req, res) => {
  if (!req.body || !req.body.mode){
    res.sendStatus(400);
    return;
  }
  let {old_style, quick_reply, simple_main, sticky_header} = req.body;
  old_style = old_style === true ? true : false;
  quick_reply = quick_reply === true ? true : false;
  simple_main = simple_main === true ? true : false;
  sticky_header = sticky_header === true ? true : false;
  client.query(`UPDATE ${getTable(req.body.mode)} SET (old_style, quick_reply, simple_main, sticky_header) = ($1, $2, $3, $4) WHERE token = $5`, [old_style, quick_reply, simple_main, sticky_header, req.body.token])
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

app.post('/createSmileSection', (req, res) => {
  if (!req.body || !req.body.mode){
    res.sendStatus(400);
    return;
  }
  let b = req.body;
  if (!b.name || !b.image){
    res.sendStatus(400);
    return;
  }
  client.query(`SELECT id, custom_smile_sections FROM ${getTable(b.mode)} WHERE token = $1 LIMIT 1`, [b.token])
  .catch(e => {
    res.sendStatus(400);
  })
  .then(result => {
    if (!result) return;
    if (!result.rowCount){
      res.sendStatus(403);
      return;
    }
    let sections = result.rows[0].custom_smile_sections || [];
    if (sections.length > 9){
      res.sendStatus(400);
      return;
    }
    let section_data = {
      id: Date.now() * 10000000 + result.rows[0].id,
      name: b.name.substring(0, 64),
      image: b.image
    }
    if (b.order){
      sections.splice(order, 0, section_data)
    }
    else{
      sections.push(section_data)
    }
    client.query(`UPDATE ${getTable(b.mode)} SET custom_smile_sections = $1 WHERE token = $2`, [sections, b.token])
    .catch(e => {
      res.sendStatus(400);
    })
    .then(() => {
      res.sendStatus(200);
    })
  })
})

app.post('/deleteSmileSection', (req, res) => {
  if (!req.body || !req.body.mode){
    res.sendStatus(400);
    return;
  }
  let b = req.body;
  client.query(`SELECT custom_smiles, custom_smile_sections FROM ${getTable(b.mode)} WHERE token = $1 LIMIT 1`, [b.token])
  .catch(e => {
    res.sendStatus(400);
  })
  .then(result => {
    if (!result) return;
    if (!result.rowCount){
      res.sendStatus(403);
      return;
    }
    let sections = result.rows[0].custom_smile_sections || [];
    let smiles = result.rows[0].custom_smiles || [];
    let index = sections.findIndex(section => {return section.id == b.id});
    if (index == -1){
      res.sendStatus(404);
      return;
    }
    sections.splice(index, 1)
    smiles = smiles.filter(smile => {return smile.section_id != b.id})
    client.query(`UPDATE ${getTable(b.mode)} SET (custom_smile_sections, custom_smiles) = ($1, $2) WHERE token = $3`, [sections, smiles, b.token])
    .catch(e => {
      res.sendStatus(400);
    })
    .then(() => {
      res.sendStatus(200);
    })
  })
})

app.post('/addSmileToSection', (req, res) => {
  if (!req.body || !req.body.mode){
    res.sendStatus(400);
    return;
  }
  let b = req.body;
  if (!b.section_id || !b.link || !b.title){
    res.sendStatus(400);
  }
  client.query(`SELECT custom_smile_sections, custom_smiles FROM ${getTable(b.mode)} WHERE token = $1`, [b.token])
  .catch(e => {
    res.sendStatus(400)
  })
  .then(result => {
    if (!result) return;
    if (!result.rowCount){
      res.sendStatus(403);
      return;
    }
    let smiles = result.rows[0].custom_smiles || [];
    let smile_sections = result.rows[0].custom_smile_sections;
    if (!smile_sections || !smile_sections.find(section => {return section.id == b.section_id}) || smiles.length > 999){
      res.sendStatus(400);
      return;
    }
    smiles.push({
      section_id: b.section_id,
      link: b.link,
      title: b.title
    })
    client.query(`UPDATE ${getTable(b.mode)} SET custom_smiles = $1 WHERE token = $2`, [smiles, b.token])
    .catch(e => {
      res.sendStatus(400);
    })
    .then(() => {
      res.sendStatus(200);
    })
  })
})

app.post('/deleteSmileFromSection', (req, res) => {
  if (!req.body || !req.body.mode){
    res.sendStatus(400);
    return;
  }
  let b = req.body;
  if (!b.section_id || b.index < 0){
    res.sendStatus(400);
    return;
  }
  client.query(`SELECT custom_smile_sections, custom_smiles FROM ${getTable(b.mode)} WHERE token = $1`, [b.token])
  .catch(e => {
    res.sendStatus(400)
  })
  .then(result => {
    if (!result) return;
    if (!result.rowCount){
      res.sendStatus(403);
      return;
    }
    let smiles = result.rows[0].custom_smiles || [];
    let smile_sections = result.rows[0].custom_smile_sections || [];
    if (!smiles.length || !smile_sections.length || !smile_sections.find(section => {return section.id == b.section_id})){
      res.sendStatus(400);
      return;
    }
    let current_section_smiles = smiles.filter(smile => {return smile.section_id == b.section_id});
    if (!current_section_smiles[b.index]){
      res.sendStatus(404);
      return;
    }
    let else_section_smiles = smiles.filter(smile => {return smile.section_id != b.section_id});
    current_section_smiles.splice(b.index, 1).concat(else_section_smiles);
    client.query(`UPDATE ${getTable(b.mode)} SET custom_smiles = $1 WHERE token = $2`, [current_section_smiles, b.token])
    .catch(e => {
      res.sendStatus(400);
    })
    .then(() => {
      res.sendStatus(200);
    })
  })
})

app.post('/getSmilesInSection', (req, res) => {
  if (!req.body || !req.body.mode){
    res.sendStatus(400);
    return;
  }
  let b = req.body;
  if (!b.section_id){
    res.sendStatus(400);
  }
  client.query('SELECT custom_smiles FROM AnimeUsers WHERE token = $1', [b.token])
  .catch(e => {
    res.sendStatus(400);
  })
  .then(result => {
    if (!result) return;
    if (!result.rowCount){
      res.sendStatus(403);
      return;
    }
    let smiles = result.rows[0].custom_smiles || [];
    res.send({
      smiles: smiles.filter(smile => {
        return smile.section_id == b.section_id;
      })
    })
  })
})

// ------------------------------

updateServerSmileData();
setInterval(updateServerSmileData, 300000);

Math.onRange = (min, value, max) => {
  return value >= min && value <= max;
}

function getTable(mode){
  switch (mode){
    case "dota2.ru":
      return "AnimeUsers"
    case "esportsgames.ru":
      return "EsportUsers";
  }
}