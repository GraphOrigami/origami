{{
//
// Origami language parser
//
// Generate the parser via `npm build`.
// @ts-nocheck
//

import * as ops from "../runtime/ops.js";
import {
  annotate,
  makeArray,
  makeFunctionCall,
  makeObject,
  makePipeline,
  makeProperty,
  makeTemplate
} from "./parserHelpers.js";

}}

// A block of optional whitespace
__
  = (inlineSpace / newLine / comment)*  {
    return null;
  }

// A filesystem path that begins with a slash: `/foo/bar`
// We take care to avoid treating two consecutive leading slashes as a path;
// that starts a comment.
absoluteFilePath "absolute file path"
  = !"//" path:leadingSlashPath {
      return annotate([[ops.filesRoot], ...path], location());
    }

args "function arguments"
  = parensArgs
  / path:leadingSlashPath {
      return annotate([ops.traverse, ...path], location());
    }

array "array"
  = "[" __ entries:arrayEntries? __ closingBracket {
      return annotate(makeArray(entries ?? []), location());
    }

// A separated list of array entries
arrayEntries
  = entries:arrayEntry|1.., separator| separator? {
      return annotate(entries, location());
    }

arrayEntry
  = spread
  / expr

// A shorthand reference to a builtin function: `:map`
builtin
  = ":" identifier:identifier {
      return annotate([ops.builtin, ":" + identifier], location());
    }

// Something that can be called. This is more restrictive than the `expr`
// parser; it doesn't accept regular function calls.
callTarget "function call"
  = absoluteFilePath
  / array
  / object
  / lambda
  / parameterizedLambda
  / group
  / builtin
  / scopeTraverse
  / namespacePath
  / namespace
  / scopeReference

// Required closing curly brace. We use this for the `object` term: if the
// parser sees a left curly brace, here we must see a right curly brace.
closingBrace
  = "}"
  / .? {
      error("Expected right curly brace");
    }

// Required closing bracket
closingBracket
  = "]"
  / .? {
      error("Expected right bracket");
    }

// Required closing parenthesis. We use this for the `group` term: it's the last
// term in the `step` parser that starts with a parenthesis, so if that parser
// sees a left parenthesis, here we must see a right parenthesis.
closingParen
  = ")"
  / .? {
      error("Expected right parenthesis");
    }

// A single line comment
comment "comment"
  = multiLineComment
  / singleLineComment

digits
  = @[0-9]+

doubleArrow = "⇒" / "=>"

doubleQuoteString "double quote string"
  = '"' chars:doubleQuoteStringChar* '"' {
    return annotate([ops.literal, chars.join("")], location());
  }

doubleQuoteStringChar
  = !('"' / newLine) @textChar

// Path that follows a builtin reference in a URL: `//example.com/index.html`
doubleSlashPath
  = "//" host:host path:path? {
      return annotate([host, ...(path ?? [])], location());
    }

ellipsis = "..." / "…" // Unicode ellipsis

escapedChar "backslash-escaped character"
  = "\\0" { return "\0"; }
  / "\\b" { return "\b"; }
  / "\\f" { return "\f"; }
  / "\\n" { return "\n"; }
  / "\\r" { return "\r"; }
  / "\\t" { return "\t"; }
  / "\\v" { return "\v"; }
  / "\\" @.

// An Origami expression, no leading/trailing whitespace
expr
  = pipeline

// Top-level Origami expression, possible shebang directive and leading/trailing
// whitepsace.
expression "Origami expression"
  = shebang? __ @expr __

float "floating-point number"
  = sign? digits? "." digits {
      return annotate([ops.literal, parseFloat(text())], location());
    }

// Parse a function and its arguments, e.g. `fn(arg)`, possibly part of a chain
// of function calls, like `fn(arg1)(arg2)(arg3)`.
functionComposition "function composition"
  // Function with at least one argument and maybe implicit parens arguments
  = target:callTarget chain:args+ end:implicitParensArgs? {
      if (end) {
        chain.push(end);
      }
      return annotate(makeFunctionCall(target, chain, location()), location());
    }
  // Function with implicit parens arguments after maybe other arguments
  / target:callTarget chain:args* end:implicitParensArgs {
      if (end) {
        chain.push(end);
      }
      return annotate(makeFunctionCall(target, chain, location()), location());
    }

// An expression in parentheses: `(foo)`
group "parenthetical group"
  = "(" __ expr:expr __ closingParen {
      return annotate(expr, location());
    }

guillemetString "guillemet string"
  = '«' chars:guillemetStringChar* '»' {
    return annotate([ops.literal, chars.join("")], location());
  }

guillemetStringChar
  = !('»' / newLine) @textChar

// A host identifier that may include a colon and port number: `example.com:80`.
// This is used as a special case at the head of a path, where we want to
// interpret a colon as part of a text identifier.
host "HTTP/HTTPS host"
  = identifier:identifier port:(":" @number)? slash:"/"? {
    const portText = port ? `:${port[1]}` : "";
    const slashText = slash ? "/" : "";
    const hostText = identifier + portText + slashText;
    return annotate([ops.literal, hostText], location());
  }

identifier "identifier"
  = chars:identifierChar+ { return chars.join(""); }

identifierChar
  = [^(){}\[\]<>\-=,/:\`"'«»\\ →⇒\t\n\r] // No unescaped whitespace or special chars
  / @'-' !'>' // Accept a hyphen but not in a single arrow combination
  / escapedChar

identifierList
  = list:identifier|1.., separator| separator? {
      return annotate(list, location());
    }

implicitParensArgs "arguments with implicit parentheses"
  // Implicit parens args are a separate list of `step`, not `expr`, because
  // they can't contain a pipeline.
  = inlineSpace+ args:step|1.., separator| separator? {
      /* Stuff */
      return annotate(args, location());
    }

inlineSpace
  = [ \t]

integer "integer"
  = sign? digits {
      return annotate([ops.literal, parseInt(text())], location());
    }

// A lambda expression: `=foo()`
lambda "lambda function"
  = "=" __ expr:expr {
      return annotate([ops.lambda, ["_"], expr], location());
    }

// A path that begins with a slash: `/foo/bar`
leadingSlashPath "path with a leading slash"
  = "/" path:path? {
      return annotate(path ?? [], location());
    }

// A separated list of expressions
list "list"
  = list:expr|1.., separator| separator? {
      return annotate(list, location());
    }

multiLineComment
  = "/*" (!"*/" .)* "*/" { return null; }

// A namespace reference is a string of letters only, followed by a colon.
namespace
  = chars:[A-Za-z]+ ":" {
    return annotate([ops.builtin, chars.join("") + ":"], location());
  }

// A namespace followed by a path: `fn:a/b/c`
namespacePath
  = fn:namespace path:doubleSlashPath {
      return annotate(makeFunctionCall(fn, [path], location()), location());
    }
  / fn:namespace path:path {
      return annotate(makeFunctionCall(fn, [path], location()), location());
    }

newLine
  = "\n"
  / "\r\n"
  / "\r"

// A number
number "number"
  = float
  / integer

// An object literal: `{foo: 1, bar: 2}`
object "object literal"
  = "{" __ entries:objectEntries? __ closingBrace {
      return annotate(makeObject(entries ?? [], ops.object), location());
    }

// A separated list of object entries
objectEntries
  = entries:objectEntry|1.., separator| separator? {
      return annotate(entries, location());
    }

objectEntry
  = spread
  / objectProperty
  / objectGetter
  / objectShorthandProperty

// A getter definition inside an object literal: `foo = 1`
objectGetter "object getter"
  = key:objectKey __ "=" __ value:expr {
      return annotate(makeProperty(key, [ops.getter, value]), location());
    }

objectHiddenKey
  = hiddenKey:("(" objectPublicKey ")") { return hiddenKey.join(""); }

objectKey "object key"
  = objectHiddenKey
  / objectPublicKey

// A property definition in an object literal: `x: 1`
objectProperty "object property"
  = key:objectKey __ ":" __ value:expr {
      return annotate(makeProperty(key, value), location());
    }

// A shorthand reference inside an object literal: `foo`
objectShorthandProperty "object identifier"
  = key:objectPublicKey {
      return annotate([key, [ops.inherited, key]], location());
    }

objectPublicKey
  = identifier:identifier slash:"/"? {
    return identifier + (slash ?? "");
  }
  / string:string {
    // Remove `ops.literal` from the string code
    return string[1];
  }

parameterizedLambda
  = "(" __ parameters:identifierList? __ ")" __ doubleArrow __ expr:expr {
      return annotate([ops.lambda, parameters ?? [], expr], location());
    }

// Function arguments in parentheses
parensArgs "function arguments in parentheses"
  = "(" __ list:list? __ ")" {
      return annotate(list ?? [undefined], location());
    }

pipeline
  = steps:(@step|1.., __ singleArrow __ |) {
      return annotate(makePipeline(steps), location());
    }

// A slash-separated path of keys
path "slash-separated path"
  // Path with at least a tail
  = head:pathElement|0..| tail:pathTail {
      let path = tail ? [...head, tail] : head;
      // Remove parts for consecutive slashes
      path = path.filter((part) => part[1] !== "/");
      return annotate(path, location());
    }
  // Path with slashes, maybe no tail
  / head:pathElement|1..| tail:pathTail? {
      let path = tail ? [...head, tail] : head;
      // Remove parts for consecutive slashes
      path = path.filter((part) => part[1] !== "/");
      return annotate(path, location());
  }

// A path key followed by a slash
pathElement
  = chars:pathKeyChar* "/" {
    return annotate([ops.literal, chars.join("") + "/"], location());
  }

// A single character in a slash-separated path.
pathKeyChar
  // This is more permissive than an identifier. It allows some characters like
  // brackets or quotes that are not allowed in identifiers.
  = [^(){}\[\],:/\\ \t\n\r]
  / escapedChar

// A path key without a slash
pathTail
  = chars:pathKeyChar+ {
    return annotate([ops.literal, chars.join("")], location());
  }

scopeReference "scope reference"
  = key:identifier {
      return annotate([ops.scope, key], location());
    }

scopeTraverse
  = ref:namespace "/" path:path? {
      return annotate([ops.traverse, ref, ...(path ?? [])], location());
    }
  / ref:scopeReference "/" path:path? {
      const head = [ops.scope, `${ ref[1] }/`];
      head.location = ref.location;
      return annotate([ops.traverse, head, ...(path ?? [])], location());
    }

separator
  = __ "," __
  / whitespaceWithNewLine

shebang
  = "#!" [^\n\r]* { return null; }

sign
  = [+\-]

singleArrow = "→" / "->"

singleLineComment
  = "//" [^\n\r]* { return null; }

singleQuoteString "single quote string"
  = "'" chars:singleQuoteStringChar* "'" {
    return annotate([ops.literal, chars.join("")], location());
  }

singleQuoteStringChar
  = !("'" / newLine) @textChar

spread
  = ellipsis expr:expr {
      return annotate([ops.spread, expr], location());
    }

// A single step in a pipeline, or a top-level expression
step
  // Literals that can't start a function call
  = number
  // Try functions next; they can start with expression types that follow
  // (array, object, etc.), and we want to parse the larger thing first.
  / functionComposition
  / taggedTemplate
  / namespacePath
  // Then try parsers that look for a distinctive token at the start: an opening
  // slash, bracket, curly brace, etc.
  / absoluteFilePath
  / array
  / object
  / lambda
  / parameterizedLambda
  / templateLiteral
  / string
  / group
  / builtin
  // Things that have a distinctive character, but not at the start
  / scopeTraverse
  / namespace
  // Least distinctive option is a simple scope reference, so it comes last.
  / scopeReference

start
  = number

string "string"
  = doubleQuoteString
  / singleQuoteString
  / guillemetString

taggedTemplate
  = tag:callTarget "`" contents:templateLiteralContents "`" {
      return annotate(makeTemplate(tag, contents[0], contents[1]), location());
    }

// A top-level document defining a template. This is the same as a template
// literal, but can contain backticks at the top level.
templateDocument "template"
  = contents:templateDocumentContents {
      return annotate([ops.lambda, ["_"], contents], location());
    }

// Template documents can contain backticks at the top level.
templateDocumentChar
  = !("${") @textChar

// The contents of a template document containing plain text and substitutions
templateDocumentContents
  = head:templateDocumentText tail:(templateSubstitution templateDocumentText)* {
      return annotate(makeTemplate(ops.template, head, tail), location());
    }

templateDocumentText "template text"
  = chars:templateDocumentChar* {
      return chars.join("");
    }

// A backtick-quoted template literal
templateLiteral "template literal"
  = "`" contents:templateLiteralContents "`" {
      return annotate(makeTemplate(ops.template, contents[0], contents[1]), location());
    }

templateLiteralChar
  = !("`" / "${") @textChar

// The contents of a template literal containing plain text and substitutions
templateLiteralContents
  = head:templateLiteralText tail:(templateSubstitution templateLiteralText)*

// Plain text in a template literal
templateLiteralText
  = chars:templateLiteralChar* {
      return chars.join("");
    }

// A substitution in a template literal: `${x}`
templateSubstitution "template substitution"
  = "${" __ @expr __ "}"

textChar
  = escapedChar
  / .

whitespaceWithNewLine
  = inlineSpace* comment? newLine __
