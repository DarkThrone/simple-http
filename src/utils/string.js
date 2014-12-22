/**
 * Created by geronimo on 12/18/14.
 */
var isString = require('./identity.js');

function trim(value){
    return isString(value) ? value.trim() : value;
}

function lowercase(string){
    return isString(string) ? string.toLowerCase() : string;
}

module.exports = {
    trim : trim,
    lowercase : lowercase
};