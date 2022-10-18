export default async function repeat(count, content) {
  const array = new Array(count);
  array.fill(content);
  return array;
}

repeat.usage = `repeat <count>, <content>\tRepeats the given content the given number of times`;
repeat.documentation = "https://graphorigami.org/cli/builtins.html#repeat";
