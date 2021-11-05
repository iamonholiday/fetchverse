const _ = require("lodash")
const https = require('https');
const cheerio = require("cheerio");
const dotenv = require('dotenv');


const express = require('express')
const app = express()
const port = Number(process.env.PORT);
const wsPort = port + 1;

const { createLogger, format, transports } = require('winston');

const logger = createLogger({
    format: format.combine(
        format.splat(),
        format.simple()
    ),
    transports: [new transports.File({ filename: './data/hist.log' })],

});



const fs = require('fs');
const ObjectsToCsv = require('objects-to-csv');
const request = require('request');

async function sleep(millis) {
return new Promise(resolve => setTimeout(resolve, millis));
}



var http = require('http');

const SHARED_OPTIONS = process.env.HTTP_OPTION;

const WebSocket = require('ws')

const wss = new WebSocket.Server({ port: wsPort })

wss.on('connection', ws => {

    ws.on('message', message => {
        console.log(`Received message => ${message}`)
    })

    app.get(`/resumes/preview_new/:profileId`,async (req, res) => {


        const profileId = req.params.profileId;
        const fetchUrl = `https://www.jobbkk.com/resumes/preview_new/${profileId}`;
        const saveHtmlPath = `./public/loaded/full_${profileId}.htm`;

        const respBody = await udfFetch(fetchUrl, SHARED_OPTIONS);

        let $ = cheerio.load(respBody);
        let html = $('section.container-print').html();



        await new Promise((resolve, reject) => {

            fs.writeFile(saveHtmlPath, html,(err) => {

                if (err) throw err;
                const note = `html saved|${profileId}`;
                console.log(note);

                resolve();
            });
        });




        res.send("loaded profile|" + profileId);

    });

    app.get(`/resumes/lists/:pageStart`,async (req, res) => {


        const logFileName = './data/fetch-log.csv';

        const startPage = Number.parseInt(req.params.pageStart);



        const listUrl = `https://www.jobbkk.com/resumes/lists/${startPage}`;
        const respBody = await udfFetch(listUrl, SHARED_OPTIONS);
        let $ = cheerio.load(respBody);

        const nData = [];
        const allJobs = [...$('div.list-job-search')];
        for (const iJob of allJobs){

            const iShortHtml = $.html(iJob);
            const $_data = cheerio.load($.html(iJob)); // cheerio.load(iJob.html());
            let prf = _.uniqBy(
                [...$_data(".clickShowDetail")].map((ie) => (
                    {
                        page : startPage,
                        link : ie.attribs.href,
                        profileId : ie.attribs.href.match(/\d*$/g)[0],
                        imgUrl : $_data("img").attr("src")
                    }
                )),
                (ie) => {

                    return ie.profileId
                }
            )[0];




            nData.push(prf);

            // write short resume
            await new Promise((resolve, reject) => {

                const saveShortPath = `./public/loaded/short_${prf.profileId}.htm`;
                fs.writeFile(saveShortPath, iShortHtml,(err) => {

                    if (err) throw err;
                    const note = `short html saved|${prf.profileId}`;
                    console.log(note);
                    ws.send(`${(startPage)}|saved short|${listUrl}|${saveShortPath}.html`);
                    resolve();
                });
            });


            // write full resume
            const fetchResumeUrl = `http://localhost:${port}/resumes/preview_new/${prf.profileId}`;
            await udfFetch(fetchResumeUrl, SHARED_OPTIONS);
            ws.send(`${(startPage)}|saved full|${fetchResumeUrl}|${prf.profileId}.html`);


            // write pic
            let pic = prf.imgUrl;
            await new Promise((resolve, reject) => {

                const picSavePath = `./public/loaded/pic_${prf.profileId}.jpg`;
                download(pic, picSavePath, function(){

                    const note = `${startPage}|saved image|${pic}|${picSavePath}`;
                    console.log(note);
                    ws.send(note)
                    resolve();
                });
            });

        }




        const writeJrny = new ObjectsToCsv(nData);
        await writeJrny.toDisk(logFileName,{ append: true });


        ws.send(`exec|page|${(startPage + 1)}`);




        fs.readFile(__dirname + '/public/finish.html', 'utf8', (err, text) => {
            res.send(text);
        });

    });

})


app.get('/welcome', (req, res) => {


    fs.readFile(__dirname + '/public/welcome.html', 'utf8', (err, text) => {
        res.send(text);
    });
});

app.get('/', (req, res) => {


    fs.readFile(__dirname + '/public/index.html', 'utf8', (err, text) => {
        res.send(text);
    });
});

const udfFetch = (fetchUrl,option) => {

    const potocol = fetchUrl.startsWith("https") ? https : http;

    return new Promise((resolve, reject) => {

        const req = potocol.request(fetchUrl, option,(resp) => {

            let body = [];
            let respBody = "";
            resp.on('data', (chunk) => {

                body.push(chunk);
            });
            resp.on('end', async () => {

                respBody = Buffer.concat(body).toString();
                console.log("fetched|" + fetchUrl);
                resolve(respBody);

            });
        });

        req.on('error', (e) => {
            console.error(`problem with request: ${e.message}`);
        });


        req.end();
    });

}

const download = function(uri, filename, callback){
    request.head(uri, function(err, res, body){
        try{

            // console.log('content-type:', res.headers['content-type']);
            // console.log('content-length:', res.headers['content-length']);

            request(uri).pipe(fs.createWriteStream(filename)).on('close', callback);
        }
        catch (err){
            // info: test message my string {}
            logger.log('error', 'image', filename);
        }
    });
};








app.listen(port, () => {

    console.log(`Example app listening at http://localhost:${port}`)
});


