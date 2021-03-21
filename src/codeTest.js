// Example
const givenArr = [
  [1, 2, 2],
  [3, 4, 5, 5],
  [6, 7, 8, 9, [11, 12, [12, 13, [14]]]],
  10,
];
// 实现flatten方法使得 flatten(givenArr)——>outputArr
// let outputArr = [1, 2, 2, 3, 4, 5, 5, 6, 7, 8, 9, 11, 12, 12, 13, 14, 10];

function flatten(arr) {
  var res = [];
  for (var i = 0; i < arr.length; i++) {
    if (Array.isArray(arr[i])) {
      res = res.concat(flatten(arr[i]));
    } else {
      res.push(arr[i]);
    }
  }
  return res;
}

function flattenES6(array) {
  //只要数组中的元素有一个嵌套数组，就合并
  while (array.some((item) => Array.isArray(item))) array = [].concat(...array);

  console.log(array); //[1,2,2,3,4,5,5,6,7,8,9,11,12,12,13,14,10]
  return array;
}

flatten(givenArr);
flattenES6(givenArr);
