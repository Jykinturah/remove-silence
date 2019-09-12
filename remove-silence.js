'use strict';

const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const MUS_PATH = "./music/";
const OUT_PATH = "./out/";

// Pads the removed silence in case it cuts it too close to the actual music.
const SILENCE_GRACE_PERIOD = .1; // in seconds

// FFMPEG filter variable stuff to adjust if desired.
const FFMPEG_SILENCE_MIN_DB= -60; // in dbs
const FFMPEG_SILENCE_MIN_DURATION = 1; // in seconds

const findSilenceDuration = async () => {
  let durations = {};
  let songs = await getSongsList(MUS_PATH);
  for(var counter = 0; counter < songs.length; counter++ )
    durations[songs[counter]] = await silenceDurationFFMPEG(MUS_PATH, songs[counter]).catch((err) => console.log(err));
  console.log('Computed Silence in ' + songs.length + (songs.length > 1 ? ' Songs.' : ' Song.'));
  return durations;
}

const getFirstSilenceDuration = (logStr) => {

/*  [silencedetect @ 0x7f8dafd00140] silence_start: 0
    [silencedetect @ 0x7f8dafd00140] silence_end: 3.26426 | silence_duration: 3.26426  */

  // 'silence_start: '     15 characters
  // 'silence_duration: '  18 characters

  let logStrings = logStr.split('\n');
  if ( logStrings.length < 2 ) return 0;

  let logLineOne = logStrings[0];
  let logLineTwo = logStrings[1];

  let checkSilenceStart = logLineOne.indexOf('silence_start');

  if ( checkSilenceStart < 0 ) return 0; // If there is no silence start found, don't clip
  if ( ! (logLineOne.substr(checkSilenceStart + 15) === '0' )) return 0; // If silence isn't at start, don't clip.

  return parseFloat(logLineTwo.substr(logLineTwo.indexOf('silence_duration:') + 18));
}

const silenceDurationFFMPEG = async (path, song) => {
  // ffmpeg -hide_banner -i <input> -af silencedetect=n=<FFMPEG_SILENCE_MIN_DB>:d=<FFMPEG_SILENCE_MIN_DURATION> -f null -
  return new Promise((resolve, reject) => {
    let stderrLog = '';
    ffmpeg(path + song)
      .audioFilters(`silencedetect=n=${FFMPEG_SILENCE_MIN_DB}dB:d=${FFMPEG_SILENCE_MIN_DURATION}`)
      .addOption('-hide_banner', '-f', 'null')
      .output('nothing written here')
      .on('stderr', (stderrLine) => { if(stderrLine.includes('silencedetect')) {stderrLog += stderrLine + '\n'} } )
      .on('end', (stdout, stderr) => { resolve(getFirstSilenceDuration(stderrLog)); } )
      .run();
  });
}

const getSongsList = async (path) => {
  return new Promise((resolve, reject) =>{
    let songs = [];
    fs.readdir(path, (err,files) => {
      if (err) return console.log(err);
      files.forEach(function (file) {
        if(file.match('.+\.(?:wav|mp3|m4a|aac|flac)$')) songs.push(file);
      }); 
      resolve(songs);
    });
  });
}

const removeSilence = (inputPath,outputPath,song,silenceDuration) => {
  ffmpeg(inputPath + song)
    .seekOutput(convertToTimeString(silenceDuration - SILENCE_GRACE_PERIOD))
    .addOption('-acodec copy')
    .output(outputPath + song)
    .on('end', (stdout, stderr) => { console.log('Processed Silence for ' + song) } )
    .run();
}

const convertToTimeString = (floatTime) => {
  let mn = Math.floor(floatTime / 60);
  let hr = Math.floor(mn / 60);
  let sc = Math.floor(floatTime);
  let ml = floatTime - sc;
  mn = mn % 60;
  if (hr === 0)
    if (mn === 0)
      return '' + sc + '.' + ml.toFixed(3).substr(2);
    return '' + mn + ":" + ( sc > 9 ? sc : "0" + sc ) + '.' + ml.toFixed(3).substr(2);
  return '' + hr + ":" + ( mn > 9 ? mn : "0" + mn ) + ":" + ( sc > 9 ? sc : "0" + sc ) + '.' + ml.toFixed(3).substr(2);
}

findSilenceDuration().then((durations) => {
  Object.keys(durations).forEach((song) => {
    removeSilence(MUS_PATH,OUT_PATH,song,durations[song]);
  });
});