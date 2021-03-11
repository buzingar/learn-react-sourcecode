'use strict';

const ncp = require('ncp').ncp;
const path = require('path');
const mkdirp = require('mkdirp');
const rimraf = require('rimraf');
const exec = require('child_process').exec;
const targz = require('targz');

function asyncCopyTo(from, to) {
  return asyncMkDirP(path.dirname(to)).then(
    () =>
      new Promise((resolve, reject) => {
        ncp(from, to, (error) => {
          if (error) {
            // Wrap to have a useful stack trace.
            reject(new Error(error));
            return;
          }
          resolve();
        });
      })
  );
}

function asyncExecuteCommand(command) {
  return new Promise((resolve, reject) =>
    exec(command, (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(stdout);
    })
  );
}

function asyncExtractTar(options) {
  return new Promise((resolve, reject) =>
    targz.decompress(options, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    })
  );
}

function asyncMkDirP(filepath) {
  return new Promise((resolve, reject) =>
    mkdirp(filepath, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    })
  );
}

/**
 * rimraf 包的作用：以包的形式包装rm -rf命令，用来删除文件和文件夹的，不管文件夹是否为空，都可删除
 * The UNIX command rm -rf for node.
 * rimraf(file, callback)
 * The callback will be called with an error if there is one.
 */
function asyncRimRaf(filepath) {
  return new Promise((resolve, reject) =>
    rimraf(filepath, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    })
  );
}

function resolvePath(filepath) {
  if (filepath[0] === '~') {
    return path.join(process.env.HOME, filepath.slice(1));
  } else {
    return path.resolve(filepath);
  }
}

module.exports = {
  asyncCopyTo,
  resolvePath,
  asyncExecuteCommand,
  asyncExtractTar,
  asyncMkDirP,
  asyncRimRaf,
};
