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

// let smile_tablets_iterator = 0;
// let pepeTables = [];
// while(fs.existsSync('./static/smileTablets/' + smile_tablets_iterator)){
//     let section_index = smile_tablets_iterator++;
//     let section_array = [];
//     pepeTables.push(section_array);
//     fs.readdir('./static/smileTablets/' + section_index, {encoding: 'utf-8'}, (error, files) => {
//         files.forEach((file, index) => {
//             fs.readFile('./static/smileTablets/' + section_index + '/' + file, {encoding: 'base64url'}, (error, data) => {
//                 section_array
//             })
//         })
//     })
// }

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

client.on('error', async (e) => {
    console.log(e)
  // reboot
  setTimeout(async () => {
      client = new Client({
          connectionString: process.env.DATABASE_URL,
          ssl: {
            rejectUnauthorized: false
          }
      });
      await client.connect()
  }, 500)
});

app.listen(PORT, () => console.log(`Listening on ${ PORT }`));

app.use(require('cors')());

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

let fontsRouter = express.Router();

fontsRouter.get('/:font_name', (req, res) => {
    let font_name = req.params.font_name;
    if (fs.existsSync('./static/fonts/' + font_name + '.ttf')) font_name += ".ttf";
    else if (fs.existsSync('./static/fonts/' + font_name + '.otf')) font_name += ".otf";
    else return void res.status(404).send();
    res.sendFile(font_name, {
        root: './static/fonts/'
    })
})

app.use('/fonts', fontsRouter);



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
    fetch('https://dota2.ru/replies/get_smiles')
    .then(res => {
        return res.json()
    })
    .catch(e => {
        setTimeout(updateServerSmileData, 5000);
    })
    .then(data => {
        if (!data) return;
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
    // ???????????????????????? ?????????? ??????????? ?????????????????? ?????? ???? ???????????????????? ?? ?????????????? ??????????
    client.query(`UPDATE ${getTable(req.body.mode)} SET last_authorize_date = NOW() WHERE token = $1
    RETURNING id, threads_bg, thread_bg_br, thread_bg_position, thread_bg_hide, thread_bg_self, custom_smile_sections,
    use_super_ignore, ignored_users_to_super, thread_ignore_include, thread_ignore_exclude, thread_ignore_users, custom_users_status`,
    [auth_token]).then(result => {
      result.rowCount ? res.send(result.rows[0]) : res.sendStatus(401);
    })
  }
  else{
    // ???????????????????????? ???? ?????????? ??????????? ?????????????????? ???? ???????????? ?? id
    let auth_password = null;
    if (b.password) auth_password = crypto.createHash('md5').update(b.password).digest('hex');
    let auth_id = Number(b.id);
    client.query(`UPDATE ${getTable(req.body.mode)} SET last_authorize_date = NOW() WHERE password = $1 and id = $2
    RETURNING id, token, threads_bg, thread_bg_br, thread_bg_position, thread_bg_hide, thread_bg_self, custom_smile_sections,
    use_super_ignore, ignored_users_to_super, thread_ignore_include, thread_ignore_exclude, thread_ignore_users, custom_users_status`,
    [auth_password, auth_id]).then(result => {
      result.rowCount ? res.send(result.rows[0]) : res.sendStatus(404);
    })
  }
})

app.post('/registerUser', (req, res) => {
  if (!req.body || req.body.password.length < 4 || !req.body.mode){
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
          // ?????????????????????? ????????????????
          client.query(`INSERT INTO ScriptUsers 
          (id, password, token, user_type) 
          VALUES ($1, $2, $3, 'dota2.ru') RETURNING id, threads_bg, thread_bg_br, thread_bg_position, thread_bg_hide, thread_bg_self, custom_smile_sections,
          use_super_ignore, ignored_users_to_super, thread_ignore_include, thread_ignore_exclude, thread_ignore_users, custom_users_status`, [auth_id, auth_password, token])
          .catch(e => {
            res.sendStatus(403);
          })
          .then(result => {
            if (!result) return;
            res.send(result.rows[0])
          })
        }
        else{
          // ?????????????????????? ???? ????????????????
          res.sendStatus(404);
        }
      })
    }, 250)
  }
  else if (req.body.mode === "esportsgames.ru"){
    // ?????????????????????? ????????????????
    client.query(`INSERT INTO ScriptUsers 
    (id, password, token, user_type) 
    VALUES ($1, $2, $3, 'esportsgames.ru') RETURNING id, threads_bg, thread_bg_br, thread_bg_position, thread_bg_hide, thread_bg_self, custom_smile_sections,
    use_super_ignore, ignored_users_to_super, thread_ignore_include, thread_ignore_exclude, thread_ignore_users, custom_users_status`, [auth_id, auth_password, token])
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
  if (!b.old_password || !b.new_password || !b.token || b.new_password.length < 4){
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
  let ids = (req.body.ids || []).map(i => +i);
  let self_id = req.body.id;
  const filter = (result, user) => {
    let result_obj = {}, ignore_array = [];
    let user_data = {};
    if (user?.rows && user.rows[0]) user_data = user.rows[0];
    ignore_array = user_data?.threads_bg_ignore || [];
    result.rows.forEach(elem => {
        let bg = elem.threads_bg ? `background-image: linear-gradient(to left, rgba(38, 39, 44, ${elem.thread_bg_br / 100}), rgba(38, 39, 44, ${elem.thread_bg_br / 100})), url(${elem.threads_bg}); background-position-y: ${elem.thread_bg_position}%;` : null;
        if (elem.thread_bg_self && elem.id != user_data.id) bg = null;
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
  let br = req.body.br ?? req.body.brightness ?? 99999;
  let pos = req.body.pos ?? req.body.position ?? 99999;
  if (req.body.type !== 'remove' && (!Math.onRange(0, br, 100) || !Math.onRange(0, pos, 100))){
    res.sendStatus(400);
    return;
  }
  client.query(`SELECT * FROM ${getTable(req.body.mode)} WHERE token = $1 LIMIT 1`, [auth_token]).then(result => {
    if (!result.rowCount) {
        res.sendStatus(401);
        return;
    }
    if (req.body.type === 'remove' || req.body.data === null){
        client.query(`UPDATE ${getTable(req.body.mode)} SET (threads_bg, thread_bg_br, thread_bg_position, thread_bg_self) = ($1, 50, 50, $2) WHERE token = $3`,
        [null, Boolean(req.body.hide || req.body.self), auth_token]).then(result => {
            res.sendStatus(200);
        })
        return;
    }
    if (req.body.data && (!req.body.type || req.body.type === 'image')){
        imgur.uploadBase64(req.body.data.substring(req.body.data.indexOf(',') + 1), null, (Date.now()).toString())
        .catch(e => {
            res.sendStatus(500);
        })
        .then(data => {
            if (!data) return;
            client.query(`UPDATE ${getTable(req.body.mode)} SET (threads_bg, thread_bg_br, thread_bg_position, thread_bg_self) = ($1, $2, $3, $4) WHERE token = $5`,
            [data.link, br, pos, Boolean(req.body.hide || req.body.self), auth_token]).then(result => {
                res.send(data.link);
            })
        })
    }
    else if ((req.body.type === 'link' && req.body.data) || req.body.link){
      isImage(res, req.body.link || req.body.data, () => {
        client.query(`UPDATE ${getTable(req.body.mode)} SET (threads_bg, thread_bg_br, thread_bg_position, thread_bg_self) = ($1, $2, $3, $4) WHERE token = $5`,
        [req.body.link || req.body.data, br, pos, Boolean(req.body.hide || req.body.self), auth_token]).then(result => {
            res.send(req.body.link || req.body.data);
        })
      })
    }
    else{
        client.query(`UPDATE ${getTable(req.body.mode)} SET thread_bg_self = $1 WHERE token = $2 RETURNING threads_bg`,
        [Boolean(req.body.hide || req.body.self), auth_token]).then(result => {
            res.status(200).send(result.rows[0].threads_bg);
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

app.post('/toggleThreadBgIgnore', (req, res) => {
    if (!req.body || !req.body.mode){
        res.sendStatus(400);
        return;
    }
    let auth_token = req.body.token;
    let t_id = +req.body.id;
    client.query(`SELECT id, threads_bg_ignore FROM ${getTable(req.body.mode)} WHERE token = $1 LIMIT 1`, [auth_token]).then(result => {
        if (!result.rowCount || result.rows[0].id === t_id){
            res.sendStatus(401);
            return;
        }
        if (result.rows[0].threads_bg_ignore.includes(t_id)){
            client.query(`UPDATE ${getTable(req.body.mode)} SET threads_bg_ignore = array_remove(threads_bg_ignore, $1) WHERE token = $2`, [t_id, auth_token])
            .then(result => {
                res.sendStatus(200);
            })
        } else {
            client.query(`UPDATE ${getTable(req.body.mode)} SET threads_bg_ignore = array_append(threads_bg_ignore, $1) WHERE token = $2`, [t_id, auth_token])
            .then(result => {
                res.sendStatus(200);
            })
        }
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

app.post('/updateCustomUserStatus', (req, res) => {
  if (!req.body || !req.body.mode){
    res.sendStatus(400);
    return;
  }
  if (!req.body.id){
    res.sendStatus(400);
    return;
  }
  client.query(`SELECT custom_users_status FROM ${getTable(req.body.mode)} WHERE token = $1`, [req.body.token])
  .catch(e => {
    res.sendStatus(400);
  })
  .then(result => {
    if (!result) return;
    if (!result.rowCount){
      res.sendStatus(403);
      return;
    }
    let obj = result.rows[0].custom_users_status;
    if (req.body.status){
        obj[req.body.id] = req.body.status;
    } else delete obj[req.body.id];
    client.query(`UPDATE ${getTable(req.body.mode)} SET custom_users_status = $1 WHERE token = $2`, [obj, req.body.token])
    .catch(e => {
      res.sendStatus(500);
    })
    .then(result => {
      res.sendStatus(200);
    })
  })
})

app.post('/getCustomUsersStatus', (req, res) => {
  if (!req.body || !req.body.mode){
    res.sendStatus(400);
    return;
  }
  client.query(`SELECT custom_users_status FROM ${getTable(req.body.mode)} WHERE token = $1`, [req.body.token])
  .catch(e => {
    res.sendStatus(400);
  })
  .then(result => {
    if (!result) return;
    if (!result.rowCount){
      res.sendStatus(403);
      return;
    }
    res.send(result.rows[0]?.custom_users_status);
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
      sections.splice(Math.clamp(0, b.order, 9), 0, section_data);
      client.query(`UPDATE ${getTable(b.mode)} SET custom_smile_sections = $1 WHERE token = $2`, [sections, b.token])
      .catch(e => {
        res.sendStatus(400);
      })
      .then(() => {
        res.status(200).send(sections);
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
// ------------------------------
// ------------------------------

let api_router = express.Router();

api_router.post('/getUserThreadsData', (req, res) => {
    if (!req.body || !req.body.mode){
        res.status(400).send({error: 'Body and mode required!'});
        return;
    }
    let ids = req.body.ids || [];
    let self_id = req.body.id;
    const executer = (users_bg, client_user) => {
        let result_obj = {};
        let is_client_user = false;
        if (client_user.rowCount){
            is_client_user = true;
            client_user = client_user.rows[0];
        }
        if (users_bg.rowCount) users_bg.rows.forEach(row => {
            let row_bg = null;
            if ((client_user.id === row.id || !row.thread_bg_self) && row.threads_bg){
                row_bg = `background-image: linear-gradient(to left, rgba(38, 39, 44, ${row.thread_bg_br / 100}), rgba(38, 39, 44, ${row.thread_bg_br / 100})), url(${row.threads_bg}); background-position-y: ${row.thread_bg_position}%;`;
            }
            result_obj[row.id] = {
                thread_bg: row_bg,
                thread_bg_ignore: false,
                custom_status: null,
            }
        })
        if (is_client_user){
            Object.entries(client_user.custom_users_status).forEach(([user_id, status]) => {
                if (ids.includes(user_id)){
                    if (result_obj[user_id]) {
                        result_obj[user_id].custom_status = status || null;
                    } else {
                        result_obj[user_id] = {
                            thread_bg: null,
                            thread_bg_ignore: false,
                            custom_status: status || null,
                        }
                    }
                }
            });
            client_user.threads_bg_ignore.forEach(id => {
                if (result_obj[id]) result_obj[id].thread_bg_ignore = true;
            })
        }
        res.send(result_obj)
    }
    if (!self_id){
        client.query(`SELECT id, threads_bg, thread_bg_br, thread_bg_position, thread_bg_self FROM ${getTable(req.body.mode)} WHERE array[id] && $1`, [ids]).then(executer)
    }
    else{
        Promise.all([
            client.query(`SELECT id, threads_bg, thread_bg_br, thread_bg_position, thread_bg_self FROM ${getTable(req.body.mode)} WHERE (array[id] && $1)`, [ids]),
            client.query(`SELECT id, threads_bg_ignore, thread_bg_hide, custom_users_status FROM ${getTable(req.body.mode)} WHERE id = $1`, [self_id]),
        ])
        .then(([users_bg, client_user]) => {
            executer(users_bg, client_user)
        })
    }
})

api_router.post('/addUserToThreadIgnore', (req, res) => {
    if (!req.body || !req.body.mode){
        res.status(400).send({error: 'Body and mode required!'});
        return;
    }
    let auth_token = req.body.token;
    let user_to_ignore = Number(req.body.id);
    if (!user_to_ignore || user_to_ignore < 0 ) return;
    client.query(`SELECT threads_bg_ignore FROM ${getTable(req.body.mode)} WHERE token = $1 LIMIT 1`, [auth_token]).then(result => {
        if (!result.rowCount){
            res.status(401).send({error: 'User not authorized'});
        } else if (result.rows[0].id == user_to_ignore){
            res.status(400).send({error: 'You can\'t add self to ignore'})
        } else if (result.rows[0].threads_bg_ignore.includes(user_to_ignore)){
            res.status(400).send({error: 'User already ignored'});
            return;
        }
        client.query(`UPDATE ${getTable(req.body.mode)} SET threads_bg_ignore = array_append(threads_bg_ignore, $1) WHERE token = $2`, [user_to_ignore, auth_token])
        .then(result => {
            res.sendStatus(200);
        })
    })
})

api_router.post('/removeUserFromThreadIgnore', (req, res) => {
    if (!req.body || !req.body.mode){
        res.status(400).send({error: 'Body and mode required!'});
        return;
    }
    let auth_token = req.body.token;
    let user_to_ignore = Number(req.body.id);
    if (!user_to_ignore || user_to_ignore < 0 ) return;
    client.query(`SELECT id, threads_bg_ignore FROM ${getTable(req.body.mode)} WHERE token = $1 LIMIT 1`, [auth_token]).then(result => {
        if (!result.rowCount){
            res.status(401).send({error: 'User not authorized'});
        } else if (result.rows[0].id == user_to_ignore){
            res.status(400).send({error: 'You can\'t remove self from ignore'})
        } else if (!result.rows[0].threads_bg_ignore.includes(user_to_ignore)){
            res.status(400).send({error: 'User already not ignored'});
            return;
        }
        client.query(`UPDATE ${getTable(req.body.mode)} SET threads_bg_ignore = array_remove(threads_bg_ignore, $1) WHERE token = $2`, [user_to_ignore, auth_token]).then(result => {
            res.sendStatus(200);
        })
    })
})

// ------------------------------

api_router.post('/updateUserCustomStatus', (req, res) => {
    if (!req.body || !req.body.mode){
        res.status(400).send({error: 'Body and mode required!'});
        return;
    }
    let user_id = Number(req.body.id);
    if (!user_id || user_id < 0){
        res.status(400).send({error: 'Invalid user id!'});
        return;
    }
    client.query(`SELECT custom_users_status FROM ${getTable(req.body.mode)} WHERE token = $1`, [req.body.token])
    .catch(e => {
        res.status(500).send({error: 'Internal Server Error'});
    })
    .then(result => {
        if (!result) return;
        if (!result.rowCount){
            res.status(401).send({error: 'User not authorized'});
            return;
        }
        let status_object = result.rows[0].custom_users_status;
        status_object[req.body.id] = req.body.status;
        client.query(`UPDATE ${getTable(req.body.mode)} SET custom_users_status = $1 WHERE token = $2`, [status_object, req.body.token])
        .catch(e => {
          res.status(500).send({error: 'Internal Server Error'});
        })
        .then(result => {
          res.sendStatus(200);
        })
    })
})

app.use('/api', api_router);

// ------------------------------
// ------------------------------
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
Math.clamp = (min, value, max) => {
    return Math.max(+min, Math.min(+max, +value))
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