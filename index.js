const express = require('express');
const path = require('path');
const {Client} = require('pg');
require('dotenv').config();
const PORT = process.env.PORT || 5000;
const bodyParser = require('body-parser');
const imgur = require('imgur');
const imgbb = require("imgbb-uploader");
const fetch = require('node-fetch')
const crypto = require('crypto');
const fs = require('fs');

const pepeTables = require('./smile-tables.json')

imgur.setClientId(process.env.IMGUR_CLIENT_ID);
imgur.setAPIUrl('https://api.imgur.com/3/');

const app = express();
app.use(bodyParser.json({limit: '15mb'}));
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

client.on('error', async () => {
  // reboot
  setTimeout(async () => {
      client = new Client({
          connectionString: process.env.DATABASE_URL,
          ssl: {
            rejectUnauthorized: false
          }
      });
      await client.connect()
  }, 5000)
});

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
  imgbb({
    apiKey: process.env.IMGBB_TOKEN,
    name: (Date.now()).toString(),
    base64string: req.body.data.substring(req.body.data.indexOf(',') + 1)
  })
  // imgur.uploadBase64(req.body.data.substring(req.body.data.indexOf(',') + 1), null, (Date.now()).toString())
  .catch(e => {
    res.sendStatus(500);
  })
  .then(data => {
    if (!data) return;
    res.send(data.url)
  })
})

// ------------------------------

let server_smiles_data = {};
function updateServerSmileData(){
  fetch('https://dota2.ru/replies/get_smiles').then(res => {
    return res.text()
  })
  .catch(e => {
    setTimeout(updateServerSmileData, 5000);
  })
  .then(data => {
    if (data?.trim()?.startsWith('<')){
      setTimeout(updateServerSmileData, 5000);
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
    client.query(`SELECT id, threads_bg, thread_bg_br, thread_bg_position, thread_bg_hide, thread_bg_self, custom_smile_sections, use_super_ignore, ignored_users_to_super, thread_ignore_include, thread_ignore_exclude, thread_ignore_users FROM ${getTable(req.body.mode)} WHERE token = $1`, [auth_token]).then(result => {
      result.rowCount ? res.send(result.rows[0]) : res.sendStatus(401);
    })
  }
  else{
    // Пользователь не имеет токен? Проверить по паролю и id
    let auth_password = null;
    if (b.password) auth_password = crypto.createHash('md5').update(b.password).digest('hex');
    let auth_id = Number(b.id);
    client.query(`SELECT id, token, threads_bg, thread_bg_br, thread_bg_position, thread_bg_hide, thread_bg_self, custom_smile_sections, use_super_ignore, ignored_users_to_super, thread_ignore_include, thread_ignore_exclude, thread_ignore_users FROM ${getTable(req.body.mode)} WHERE password = $1 and id = $2 LIMIT 1`, [auth_password, auth_id]).then(result => {
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
    setTimeout(() => {
      fetch("https://dota2.ru/forum/api/forum/showPostRates", {method: "POST", headers: headers, body: JSON.stringify(verif_object)})
      .catch(e => {
        res.sendStatus(500)
      })
      .then(r => { if (r) return r.json()})
      .catch(e => {
        res.sendStatus(500);
        return;
      })
      .then(data => {
        if (!data) return;
        if (data.find(users => {
          return users.link.endsWith('.' + auth_id)
        })){
          console.log('register confirmed')
          // Регистрация пройдена
          client.query(`INSERT INTO ScriptUsers 
          (id, password, token, threads_bg, thread_bg_br, thread_bg_position, threads_bg_ignore, thread_bg_hide, thread_bg_self, user_type, use_super_ignore, ignored_users_to_super, thread_ignore_include, thread_ignore_exclude, thread_ignore_users) 
          VALUES ($1, $2, $3, null, DEFAULT, DEFAULT, DEFAULT, DEFAULT, DEFAULT, 'dota2.ru', FALSE, FALSE, null, null, null) RETURNING token`, [auth_id, auth_password, token])
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
    }, 250)
  }
  else if (req.body.mode === "esportsgames.ru"){
    // Регистрация пройдена
    client.query(`INSERT INTO ScriptUsers 
    (id, password, token, threads_bg, thread_bg_br, thread_bg_position, threads_bg_ignore, thread_bg_hide, thread_bg_self, user_type, use_super_ignore, ignored_users_to_super, thread_ignore_include, thread_ignore_exclude, thread_ignore_users) 
    VALUES ($1, $2, $3, null, DEFAULT, DEFAULT, DEFAULT, DEFAULT, DEFAULT, 'esportsgames.ru', FALSE, FALSE, null, null, null) RETURNING token`, [auth_id, auth_password, token])
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
  const filter = (result, user) => {
    let result_obj = {}, ignore_array = [];
    let user_data = {};
    if (user?.rows && user.rows[0]) user_data = user.rows[0];
    ignore_array = user_data?.threads_bg_ignore || [];
    result.rows.forEach(elem => {
      let bg = elem.threads_bg ? `background-image: linear-gradient(to left, rgba(38, 39, 44, ${elem.thread_bg_br / 100}), rgba(38, 39, 44, ${elem.thread_bg_br / 100})), url(${elem.threads_bg}); background-position-y: ${elem.thread_bg_position}%;` : null;
      if (elem.thread_bg_self && elem.id != user_data.id) bg = null;
      if (user_data.thread_bg_hide && elem.id != user_data.id) bg = null;
      result_obj[elem.id] = {
        bg: bg,
        ignored: ignore_array.includes(elem.id)
      }
    })
    res.send(result_obj)
  }
  if (!self_id){
    client.query(`SELECT id, threads_bg, thread_bg_br, thread_bg_position, thread_bg_self FROM ${getTable(req.body.mode)} WHERE array[id] && $1`, [ids]).then(filter)
  }
  else{
    Promise.all([
      client.query(`SELECT id, threads_bg, thread_bg_br, thread_bg_position, thread_bg_self FROM ${getTable(req.body.mode)} WHERE (array[id] && $1)`, [ids]),
      client.query(`SELECT id, threads_bg_ignore, thread_bg_hide FROM ${getTable(req.body.mode)} WHERE id = $1`, [self_id])
    ])
    .then(([result, user]) => {
      filter(result, user)
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
      client.query(`UPDATE ${getTable(req.body.mode)} SET (threads_bg, thread_bg_br, thread_bg_position, thread_bg_hide, thread_bg_self) = ($1, DEFAULT, DEFAULT, $2, $3) WHERE token = $4`, [null, Boolean(req.body.hide), Boolean(req.body.self), auth_token]).then(result => {
        res.sendStatus(200);
      })
    }
    else if (req.body.data){
      imgur.uploadBase64(req.body.data.substring(req.body.data.indexOf(',') + 1), null, (Date.now()).toString())
      .catch(e => {
        res.sendStatus(500);
      })
      .then(data => {
        if (!data) return;
        client.query(`UPDATE ${getTable(req.body.mode)} SET (threads_bg, thread_bg_br, thread_bg_position, thread_bg_hide, thread_bg_self) = ($1, $2, $3, $4, $5) WHERE token = $6`, [data.link, br, pos, Boolean(req.body.hide), Boolean(req.body.self), auth_token]).then(result => {
          res.send(data.link);
        })
      })
    }
    else if (req.body.link){
      isImage(res, req.body.link, () => {
        client.query(`UPDATE ${getTable(req.body.mode)} SET (threads_bg, thread_bg_br, thread_bg_position, thread_bg_hide, thread_bg_self) = ($1, $2, $3, $4, $5) WHERE token = $6`, [req.body.link, br, pos, Boolean(req.body.hide), Boolean(req.body.self), auth_token]).then(result => {
          res.send(req.body.link);
        })
      })
    }
    else{
      client.query(`UPDATE ${getTable(req.body.mode)} SET (thread_bg_hide, thread_bg_self) = ($1, $2) WHERE token = $3`, [Boolean(req.body.hide), Boolean(req.body.self), auth_token]).then(result => {
        res.sendStatus(200);
      })
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
  isImage(res, b.image, () => {
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
        sections.splice(b.order, 0, section_data)
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
  isImage(res, b.link, () => {
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
    current_section_smiles.splice(b.index, 1);
    smiles = current_section_smiles.concat(else_section_smiles);
    client.query(`UPDATE ${getTable(b.mode)} SET custom_smiles = $1 WHERE token = $2`, [smiles, b.token])
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
  client.query(`SELECT custom_smiles FROM ${getTable(b.mode)} WHERE token = $1`, [b.token])
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

app.post('/createAnime2ruSmile', (req, res) => {
  if (!req.body || !req.body.mode){
    res.sendStatus(400);
    return;
  }
  let b = req.body;
  if (!b.title || !b.link || !b.token){
    res.sendStatus(400);
    return;
  }
  if (b.link.includes('tenor')){
    res.sendStatus(400);
    return;
  }
  isImage(res, b.link, () => {
    client.query(`SELECT id FROM ${getTable(b.mode)} WHERE token = $1`, [b.token]).then(result => {
      if (!result) return;
      if (!result.rowCount){
        res.sendStatus(403);
      }
      client.query('UPDATE AnimeSmiles SET data = array_append(data, $1::jsonb)', [{title: b.title, link: b.link}])
      .catch(e => {
        res.sendStatus(400);
      })
      .then(() => {
        res.sendStatus(200);
      })
    })
  })
})

app.get('/getAnime2ruSmiles', (req, res) => {
  client.query('SELECT data from AnimeSmiles')
  .catch(e => {
    res.sendStatus(400);
  })
  .then(result => {
    res.send({smiles: result.rows[0].data});
  })
})

app.get('/getAnime2ruSmileTablets', (req, res) => {
  res.send({smiles: pepeTables});
})

// ------------------------------

Array.prototype.trimNclear = function(){
  var result = this;
  result.forEach(function(i, index){
    result[index] = i.trim();
  });
  return result.filter(function(i){
    return i;
  });
}

app.post('/updateThreadSuperIgnore', (req, res) => {
  if (!req.body || !req.body.mode){
    res.sendStatus(400);
    return;
  }
  let use_super = !!req.body.use_super_ignore;
  let ignored_to_super = !!req.body.ignored_to_super;
  let users = (req.body.users || [])?.trimNclear();
  let include = (req.body.include || [])?.trimNclear();
  let exclude = (req.body.exclude || [])?.trimNclear();
  client.query(`UPDATE ${getTable(req.body.mode)} SET (use_super_ignore, ignored_users_to_super, thread_ignore_include, thread_ignore_exclude, thread_ignore_users) = 
  ($1, $2, $3, $4, $5) WHERE token = $6 RETURNING use_super_ignore, ignored_users_to_super, thread_ignore_include, thread_ignore_exclude, thread_ignore_users`, [use_super, ignored_to_super, include, exclude, users, req.body.token])
  .catch(e => {
    res.sendStatus(400);
    return;
  }).then(result => {
    if (!result) return;
    if (!result.rowCount) {
      res.sendStatus(403);
      return;
    }
    res.send(result.rows[0]);
  })
})

// ------------------------------

updateServerSmileData();
setInterval(updateServerSmileData, 300000);

Math.onRange = (min, value, max) => {
  return value >= min && value <= max;
}

function isImage(res, link, callback){
  if (!link.startsWith('http')){
    res.sendStatus(404);
    return;
  }
  fetch(link)
  .catch(e => {
    res.sendStatus(404);
  })
  .then(r => {
    // console.log(r.headers.get('Content-Length'));
    (r.status == 200 && r.headers.get("Content-Type").includes('image')) ? callback() : res.sendStatus(404);
  })
}

function getTable(mode){
  switch (mode){
    case "dota2.ru":
      return "AnimeUsers"
    case "esportsgames.ru":
      return "EsportUsers";
  }
};