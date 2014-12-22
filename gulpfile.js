/**
 * Created by geronimo on 12/11/14.
 */

var gulp = require('gulp');
var browserify = require('gulp-browatchify');
var source = require('vinyl-source-stream');

gulp.task('browserify', function(){
    gulp.src('./src/http.js')
        .pipe(browserify({debug: !process.env.production }))
        .pipe(source('simple-http.js'))
        .pipe(gulp.dest('./build'));
});

gulp.watch('./src/*.js', ['browserify']);

gulp.task('default', ['browserify']);