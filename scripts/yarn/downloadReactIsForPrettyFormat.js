'use strict';

const path = require('path');
const pacote = require('pacote'); // 从npm注册表中获取包清单和压缩包。
const rimraf = require('rimraf'); // 删除文件 rm -rf
const prettyFormatPkg = require('pretty-format/package.json'); // Stringify任何JavaScript值。
const prettyFormatPkgPath = require.resolve('pretty-format/package.json');

const reactIsDependencyVersion = prettyFormatPkg.dependencies['react-is'];

if (!reactIsDependencyVersion) {
  throw new Error('Unable to find `react-is` dependency in `pretty-format`');
}

const prettyFormatNodeModulesReactIsDir = path.join(
  path.dirname(prettyFormatPkgPath),
  'node_modules/react-is'
);

rimraf.sync(prettyFormatNodeModulesReactIsDir);

pacote
  .extract(
    `react-is@${reactIsDependencyVersion}`,
    prettyFormatNodeModulesReactIsDir
  )
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
