/**
 * Created by geronimo on 12/18/14.
 */

function isBlob(obj) { return Object.prototype.toString.call(obj) === '[object Blob]'; }

function isFile(obj) { return Object.prototype.toString.call(obj) === '[object File]'; }

function isString(value) {return typeof value === 'string'; }

function isDefined(value) {return typeof value !== 'undefined'; }

function isFunction(value) {return typeof value === 'function'; }

function isUndefined(value) {return typeof value === 'undefined'; }

function isPromiseLike(obj) { return obj && isFunction(obj.then); }


module.exports = {
    isBlob          : isBlob,
    isFile          : isFile,
    isArray         : Array.isArray,
    isString        : isString,
    isDefined       : isDefined,
    isFunction      : isFunction,
    isUndefined     : isUndefined,
    isPromiseLike   : isPromiseLike
};
