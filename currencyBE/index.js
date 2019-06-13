// requirements
const fetch = require('node-fetch');
const moment = require("moment");
const _ = require('lodash');
var cors = require('cors')
var express = require('express');
const brain = require('brain.js');

//env
var env = 'https://api.exchangeratesapi.io/';
var app = express();
app.use(cors())

//variables

app.get('/req', function (req, res) {
    var format = 'YYYY-MM-DD';
    var base = req.query.base;
    var symbol = req.query.symbol;
    var waitingDays = req.query.wd;
    var Wks = moment().subtract(25, 'weeks').format(format);
    var today = moment().format(format);
    var responseSent = [];
    var URL = env + 'history?start_at=' + Wks + '&end_at=' + today + '&base=' + base + '&symbols=' + symbol;
    fetch(URL)
        .then(res => res.json())
        .then(json => {
            let arr = Object.keys(json.rates).sort().map((o, i) => {
                return {
                    date: o,
                    conv: json.rates[o][symbol]
                }
            });
            let arr2 = _.orderBy(arr, ['date'], ['asc']).map((o, i) => {
                let slope = (arr[i - 1 >= 0 ? i - 1 : 0].conv - o.conv) / 1;
                o.day = i + 1;
                o.val = 0;
                o.diff = Math.abs(slope);
                o.dir = slope < 0 ? 1 : 0;
                return o;
            });
            let indix = arr2.indexOf(_.minBy(arr2, 'conv'))
            arr2[indix].val = 1
            return arr2;
        })
        .then(dat => {
            this.responseSent = dat;
            var ratio = _.maxBy(this.responseSent, 'conv').conv
            const net = new brain.recurrent.LSTMTimeStep({
                inputSize: 3,
                hiddenLayers: [3, 3],
                outputSize: 3
            });
            net.train(trainingData(dat, ratio), {
                learningRate: 0.005,
                errorThresh: 0.02,
                iterations: 4000
            })
            var forecst = [
                [dat[dat.length - 1].conv, dat[dat.length - 1].diff, dat[dat.length - 1].dir],
                [dat[dat.length - 2].conv, dat[dat.length - 2].diff, dat[dat.length - 2].dir],
                [dat[dat.length - 3].conv, dat[dat.length - 3].diff, dat[dat.length - 3].dir]
            ]
            var output = net.forecast(forecst, waitingDays)            
            return [output, ratio]
        })
        .then(dato => {
            let arr4 = JSON.parse(JSON.stringify(Array.from(dato[0])))
            arr4 = arr4.map((o, i) => {
                return {
                    date: moment().add(i + 1, 'days').format(format),
                    conv: o[0] * dato[1],
                    diff: o[1] * dato[1],
                    dir: o[2]
                }
            });
            res.json([{
                query: this.responseSent,
                response: arr4
            }]);
        })
        .catch(err => {
            res.json(err);
        });
});

app.listen(3000, function () {
    console.log('Example app listening on port 3000!');
});


function trainingData(array, ratio) {
    let trainingData = []

    array.map((item, i) => {
        trainingData.push([(item.conv / ratio), (item.diff / ratio), item.dir]);
    });
    return trainingData
}