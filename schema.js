var schema = process.argv[2];
var outPattern = process.argv[3];

if (process.argv.length < 4)
{
	console.log("Usage: node schema.js schemas.sql outFilePattern");
	console.log("Example: node schema.js foo.sql classes/{className}.php");
	process.exit();
}

var fs = require('fs');

var mysqlSchema = {};

String.prototype.startsWith = function(x)
{
	return this.indexOf(x) === 0;
};
var getKeys = function(x)
{
	var ret=[];
	for (var i in x)
		if (x[i] !== x.__proto__[i])
			ret.push(i);
	return ret;
}
var getValues = function(x)
{
	var ret=[];
	for (var i in x)
		if (x[i] !== x.__proto__[i])
			ret.push(x[i]);
	return ret;
}

var parseComment = function(commentString)
{
	var tokens = commentString.split(";");
	var ret = {};
	
	for (var k=0; k<tokens.length; k++)
	{
		var token = tokens[k].trim();
		var hasParam = token.indexOf('(') > 0 && token.indexOf(')') > 0;
		var params = {};
		var argument = token;
		if (hasParam)
		{
			var i0 = token.indexOf('(');
			var i1 = token.indexOf(')');
			var rawParams = token.substring(i0+1, i1);
			rawParams = rawParams.split(',');
			
			for (var k=0; k<rawParams.length; k++)
			{
				var p = rawParams[k].trim();
				if (p.indexOf('=') > 0)
				{
					p = p.split('=',2);
					params[p[0].trim()] = p[1].trim();
				}
				else
				{
					params[p] = true;
				}
			}
			argument = token.substring(0, i0);
		}
		
		if (typeof ret[argument] !== 'undefined')
		{
			throw "Duplicate argument: " + argument;
		}
		ret[argument] = params;
	}
	
	return ret;
};

var parse = function (str)
{
	//remove comments
	var comments = /\-\-[^\n\r]*/gi;
	str = str.replace(comments, "");
	//remove useless lines
	str = str.replace(/[\n\r]+/gi, "");
	//remove useless spaces
	str = str.replace(/\s+/gi, " ");
	
	var requests = str.split(";");
	
	var tables = {};
	
	for (var i=0; i<requests.length; i++)
	{
		var request = requests[i];
		var invariant = request.toLowerCase();
		var p = new requestParser(request,invariant);
		
		if (invariant.startsWith("/*"))
			continue;
		else if (invariant.startsWith("drop table"))
			continue;
		else if (invariant.startsWith("create table"))
		{
			var result = parseCreateTable(p);
			tables[result.name] = result;
		}
		else if (invariant.startsWith("alter table"))
		{
			var result = parseAlterTable(p);
			var table = tables[result.table];
			var constraints = result.constraints;
			
			for (var j=0; j<constraints.length; j++)
			{
				table.constraints.push(constraints[j]);
			}
		}
	}
	
	return tables;
};

var requestParser = function(request, invariant)
{
	this.request = request;
	this.invariant = invariant;
	this.pos = 0;
};
requestParser.prototype.skipMany = function (chr, invariant)
{
	var x=0;
	while (this[invariant ? "invariant":"request"][this.pos] === chr)
	{
		this.pos++;
		x++;
	}
	return x;
};
requestParser.prototype.nextWord = function ()
{
	var x = this.request.substring(this.pos).match(/[a-zA-Z0-9_]+/);
	
	if (x.length == 0)
		return null;
	else if (x.length > 1)
		throw "more than 1 result found";
	
	this.pos += this.request.substring(this.pos).indexOf(x[0]) + x[0].length;
	
	return x[0];
};
requestParser.prototype.skipUntil = function (chr, invariant)
{
	while (this[invariant ? "invariant":"request"][this.pos] !== chr)
		this.pos++;
};
requestParser.prototype.skipString = function (str, invariant)
{
	if (this[invariant ? "invariant":"request"].substring(this.pos).startsWith(str))
	{
		this.pos += str.length;
	}
	else
		throw "string not found:" + str;
}
requestParser.prototype.parseIdentifier = function ()
{
	this.skipMany(' ');
	if (this.request[this.pos] === '`')
		this.pos++;
	this.skipMany(' ');
	
	var end = this.pos;
	while (this.request[end] != '`' && this.request[end] != ' ')
	{
		end++;
	}
	
	var identifier = this.request.substring(this.pos, end);
	this.pos += identifier.length;
	
	this.skipMany(' ');
	if (this.request[this.pos] === '`')
		this.pos++;
	this.skipMany(' ');
	
	return identifier;
};

requestParser.types = {
	"tinyint" : { args: 1, isInt:true },
	"smallint" : { args: 1, isInt:true },
	"mediumint" : { args: 1, isInt:true },
	"int" : { args: 1, isInt:true },
	"bigint" : { args: 1, isInt:true },
	"float" : { args: 2, isDouble:true },
	"double" : { args: 2, isDouble:true },
	"decimal" : { args: 2, isDouble:true },
	"bit" : { args: 1, isBool:true },
	"char" : { args: 1, isString:true },
	"varchar" : { args: 1, isString:true },
	"tinytext" : { args: 0, isString:true },
	"text" : { args: 0, isString:true },
	"mediumtext" : { args: 0, isString:true },
	"longtext" : { args: 0, isString:true },
	"binary" : { args: 1 },
	"varbinary" : { args: 1 },
	"tinyblob" : { args: 0 },
	"blob" : { args: 0 },
	"mediumblob" : { args: 0 },
	"longblob" : { args: 0 },
	"enum" : { args: 65535, isEnum:true },
	"set" : { args: 64, isEnum:true },
	"date" : { args: 0, isDate:true },
	"datetime" : { args: 0, isDate:true },
	"time" : { args: 0, isInt:true },
	"timestamp" : { args: 0, isInt:true },
	"year" : { args: 0, isInt:true },
};
requestParser.modifiers = {
	"not null":			/NOT NULL/i,
	"auto increment":	/AUTO_INCREMENT/i,
	"collate":			/COLLATE\s+[^\s,]+/i,
	"default":			/DEFAULT\s+[^\s,]+/i,
	"unsigned":			/unsigned/i,
	"comment":			/COMMENT\s+'([^']+)'/i,
};
requestParser.tableModifiers = {
	"engine": /engine=([^\s;]+)/i ,
	"auto increment value": /auto_increment=([0-9]+)/i ,
	"default charset": /default\s+charset=([^\s;]+)/i ,
	"collate": /collate=([^\s;]+)/i ,
	"comment": /comment='([^']+)'/i ,
};
requestParser.keys = {
	"primary":	/PRIMARY KEY\s+\([^\)]+\)/i ,
	"unique":	/UNIQUE KEY\s+`?[^\s]+`?\s*\([^\)]+\)/i ,
	"index":	/KEY\s+`?[^\s]+`?\s*\([^\)]+\)/i ,
};

requestParser.prototype.parseKey = function ()
{
	return this.__parseExpression(requestParser.keys, "no key found");
};
requestParser.prototype.parseModifier = function ()
{
	return this.__parseExpression(requestParser.modifiers, "no modifier found");
};
requestParser.prototype.parseTableModifier = function ()
{
	return this.__parseExpression(requestParser.tableModifiers, "no table modifier found");
};

requestParser.prototype.parseConstraint = function()
{
	this.skipString("constraint", true);
	var constraintName = this.parseIdentifier();
	
	this.skipString("foreign key", true);
	this.skipMany(' ');
	this.skipMany('(');
	var foreignKey = this.parseIdentifier();
	this.skipMany(')');
	
	this.skipMany(' ');
	this.skipString("references", true);
	var refTable = this.parseIdentifier();
	if (refTable == "REFERENCES")
		throw "bad parsing";
	
	this.skipMany(' ');
	this.skipMany('(');
	var refKey = this.parseIdentifier();
	this.pos++; // )
	
	return {
		name: constraintName,
		foreignKey: foreignKey,
		reference: {
			table: refTable,
			key: refKey
		}
	};
};

requestParser.prototype.__parseExpression = function(dictionary, errorMessage)
{
	this.skipMany(' ');
	
	var str = this.request.substring(this.pos);
	var keyExpression = null;
	var key;
	var groups=[];
	
	for (key in dictionary)
	{
		var reg = dictionary[key];
		var result = str.match(reg);
		if (result != null && result.length > 0)
		{
			var raw = result[0];
			if (str.indexOf(raw) !== 0)
			{
				continue;
			}
			else
			{
				keyExpression = raw;
				//console.log('found expr:', reg)
				
				for (var i=1; i<result.length; i++)
				{
					groups.push(result[i]);
				}
				
				break;
			}
		}
	}
	
	if (keyExpression === null)
		throw errorMessage;
	
	this.pos += keyExpression.length;
	
	return {
		type: key,
		expression: keyExpression,
		groups: groups,
	};
};

requestParser.prototype.parseType = function()
{
	var word = this.nextWord();
	var typeWord = requestParser.types[word];
	
	if (!typeWord)
		throw "no valid type found";
	
	var ret = {};
	ret.kind = word;
	ret.maxArguments = typeWord.args;
	ret.arguments = [];
	ret.word = typeWord;
	
	//parse args, if any
	this.skipMany(' ');
	if (this.request[this.pos] === '(')
	{
		this.pos++;
		var end = this.request.substring(this.pos).indexOf(')');
		
		var sub = this.request.substring(this.pos, this.pos+end).split(',');
		
		if (sub.length > ret.maxArguments)
			throw "too many type arguments";
		
		for (var i=0; i<sub.length; i++)
		{
			var a = parseInt(sub[i]);
			if (isNaN(a))
				a=sub[i];
			ret.arguments[i] = a;
		}
		
		//jump outside of parenthesis
		this.pos += end + 1;
	}
	
	return ret;
};

var parseCreateTable = function (request)
{
	try
	{
		request.skipString("create table if not exists", true);
	}
	catch (err)
	{
		request.skipString("create table", true);
	}
	
	//parse table name
	var tableName = request.parseIdentifier();
	console.log("Table name: " + tableName);
	
	//jump into table structure definition
	request.skipUntil('(');
	request.pos++;
	
	//fields
	var tableFields = [];
	var tableKeys = [];
	var tableConstraints = [];
	
	while (true)
	{
		//try to parse key defs first
		try
		{
			var key = request.parseKey();
			var expr = key.expression;
			
			var name = null;
			var fields=[];
			
			try
			{
				var p = new requestParser(expr, expr.toLowerCase());
				p.skipMany(' ');
				var lookup;
				if (key.type == "primary") lookup = "primary key";
				else if (key.type == "unique") lookup = "unique key";
				else lookup = "key";
				
				p.skipString(lookup, true);
				p.skipMany(' ');
				
				if (p.request[p.pos] != '(')
				{
					name = p.parseIdentifier();
				}
				
				p.skipMany(' ');
				if (p.request[p.pos] != '(')
					throw "expected '(' while parsing key expression";
				p.pos++;
				
				while (true)
				{
					var field = p.parseIdentifier();
					fields.push(field);
					if (p.request[p.pos] !== ',')
					{
						p.pos++;
						break;
					}
					p.pos++;
				}
				
				tableKeys.push({
					type: key.type,
					name: name,
					fields: fields
				});
			}
			catch (err2)
			{
				console.log("parse error on key expr: "+err2);
				process.exit();
			}
		}
		catch (error)
		{
			//then try to parse constraints
			try
			{
				var c = request.parseConstraint();
				tableConstraints.push(c);
				console.log("parsed table constraint: ", c);
			}
			catch (error)
			{
				//else parse fields
				var name = request.parseIdentifier();
				console.log("Found field: ",name);
				
				var type = request.parseType();
				console.log("Found type: ", type);
				
				//parse modifiers
				var modifiers = [];
				while (true)
				{
					var mod;
					try
					{
						mod = request.parseModifier();
					}
					catch (error)
					{
						break;
					}
					
					console.log("found modifier: ", mod);
					modifiers.push(mod);
				}
			
				//store it
				tableFields.push({ name:name, type:type, modifiers:modifiers });
			}
		}
		
		//done?
		request.skipMany(' ');
		var next = request.request[request.pos];
		if (next === ')')
		{
			break;
		}
		else if (next === ',')
		{
			request.pos++;
			request.skipMany(' ');
		}
		else
		{
			throw "unexpected char: "+next;
		}
	}
	
	//jump outside parenthesis
	request.skipString(')');
	request.skipMany(' ');
	
	//parse table modifiers and properties
	var tableModifiers = [];
	var parent={};
	
	while (request.pos < request.request.length)
	{
		try
		{
			var tmod = request.parseTableModifier();
			console.log("Got table modifier: "+tmod.type+", "+tmod.expression);
		}
		catch (e)
		{
			console.log('////////////////////');
			console.log(request.request.substring(request.pos))
			console.log("Table: ", tableName);
			throw e;
		}
		
		if (tmod.type == 'comment')
		{
			var arguments = parseComment(tmod.groups[0]);
			for (var argument in arguments)
			{
				var params = arguments[argument];
				var keys = getKeys(params);
				
				console.log(params,"and",keys)
				
				if (argument === '@extends')
				{
					if (keys.length != 3)
						throw "Wrong argument count for argument @extends. Usage: @extends(parentTable, match=thisKey, on=parentKey";
					parent.name = keys[0];
					parent.thisKey = params['match'];
					parent.parentKey = params['with'];
				}
				else
					throw "Unknown table argument: " + argument + " for table " + tableName;
			}
		}
		tableModifiers.push(tmod);
		request.skipMany(' ');
	}
	
	return {
		name: tableName,
		fields: tableFields,
		keys: tableKeys,
		constraints: tableConstraints,
		modifiers: tableModifiers,
		parent: parent,
	};
};

var parseAlterTable = function (request)
{
	request.skipString("alter table", true);
	
	var tableName = request.parseIdentifier();
	var constraints = [];
	
	while (true)
	{
		request.skipMany(' ');
		
		request.skipString("add ", true);
		
		constraints.push(request.parseConstraint());
		
		var next = request.request[request.pos];
		if (next === ',')
		{
			request.pos++;
		}
		else
		{
			break;
		}
	}
	
	return {
		table: tableName,
		constraints: constraints
	};
};

////////////////////////////////////////////////////////////////////////

try
{
	schema = fs.readFileSync(schema).toString();
}
catch (e)
{
	console.error("Failed to read schemas");
	process.exit();
}
var tables = parse(schema);

var files = [];

var table2className = function(x)
{
	//activities
	if (x.substring(x.length-3) == "ies")
		return x.substring(0, x.length-3)+"y";
	//cats
	else
		return x.substring(0, x.length-1);
};
var getField = function (table, field)
{
	for (var j=0; j<table.fields.length; j++)
	{
		if (table.fields[j].name == field)
		{
			return table.fields[j];
		}
	}
	return null;
};
var isFieldUnique = function(table, field)
{
	if (typeof field != "string")
		field = field.name;
	
	var keys = table.keys;
	for (var i=0; i<keys.length; i++)
	{
		if ((keys[i].type == "primary" || keys[i].type == "unique") &&
			keys[i].fields.length === 1 &&
			keys[i].fields[0] === field)
		{
			return true;
		}
	}
	
	return false;
};

var phpClass = function(name, sqlTable, identifiers)
{
	console.log("new PHP Class: ", name,sqlTable);
	
	this.name=name;
	this.classPrefix="";
	this.sqlTable=sqlTable;
	this.fields = {};
	this.parent=null;
	this.children = [];
	this.ref = {
		one2one: {},
		one2many: {},
		many2one: {}
	};
	this.identifiers = identifiers;
};
phpClass.prototype.addField = function(f)
{
	this.fields[f.name] = f;
};
phpClass.prototype.one2one = function(thisField, thatClass, thatField)
{
	this.ref.one2one[thatClass.name] = { thisField:thisField, thatField:thatField, real:true };
	thatClass.ref.one2one[this.name] = { thisField:thatField, thatField:thisField };
};
phpClass.prototype.one2many = function(thisField, thatClass, thatField)
{
	this.ref.one2many[thatClass.name] = { thisField:thisField, thatField:thatField, real:true };
	thatClass.ref.many2one[this.name] = { thisField:thatField, thatField:thisField };
};
phpClass.prototype.many2one = function(thisField, thatClass, thatField)
{
	this.ref.many2one[thatClass.name] = { thisField:thisField, thatField:thatField, real:true };
	thatClass.ref.one2many[this.name] = { thisField:thatField, thatField:thisField };
};

phpClass.prototype.serialize = function ()
{
	var code = "";
	var indent = "";
	var write = function(x){ code += x; };
	var writeLine = function(x){ code += x+"\n"+indent; };
	
	var _this=this;
	var block = function(fn)
	{
		(function(fn){
			code += "{\n";
			
			indent += "\t";
			code += indent;
			
			fn.call(this);
			while (code[code.length-1] == "\t")
				code = code.substring(0, code.length-1);
			
			indent = indent.substring(1);
			code += indent + "}\n";
			code += indent;
		}).call(_this, fn);
	};
	
	var phpize = function(obj, _indent)
	{
		var tabs = _indent || '';
		tabs += indent;
		
		if (typeof obj == 'object')
		{
			var _x = "array(\n";
			
			for (var oKey in obj)
			{
				var oVal = phpize(obj[oKey], tabs + '\t');
				_x += tabs + "'"+oKey+"' => "+oVal+",\n";
			}
			return _x + tabs.substring(1) + ")";
		}
		else
			return obj.toString();
	};
	
	writeLine("<?php");
	writeLine("class "+this.classPrefix+this.name+" extends "+this.parent);
	block(function()
	{
		writeLine("// SQL info");
		var sqlInfo = {};
		
		//table name
		sqlInfo.tableName = "'"+this.sqlTable+"'";
		
		//field names
		sqlInfo.fieldNames=[];
		for (var i in this.fields)
		{
			sqlInfo.fieldNames.push("'"+this.fields[i].name+"'");
		}
		
		//identifier names
		var identifier = null;
		for (var i=0; i<this.identifiers.length; i++)
		{
			if (this.identifiers[i].primary)
			{
				identifier = this.identifiers[i];
				break;
			}
		}
		if (!identifier)
			throw "PHP Class "+this.name+" has no primary key defined.";
		sqlInfo.identifier = [];
		for (var i=0; i<identifier.fields.length; i++)
		{
			sqlInfo.identifier.push("'"+identifier.fields[i]+"'");
		}
		
		//special field types
		var fieldTypes = {};
		fieldTypes.datetime={};
		fieldTypes.int={};
		fieldTypes.uint={};
		fieldTypes.double={};
		fieldTypes.bool={};
		fieldTypes.enum={};
		
		var uiTypes = {};
		uiTypes.slider={};
		uiTypes.media={};
		
		for (var i in this.fields)
		{
			var name=this.fields[i].name;
			var type=this.fields[i].type;
			var kind=type.kind;
			var unsigned = false;
			for (var j=0; j<this.fields[i].modifiers.length; j++)
			{
				if (this.fields[i].modifiers[j].type == "unsigned")
					unsigned = true;
			}
			var category = null;
			var val = 'true';
			
			if (type.word.isDate)
				category = "datetime";
			else if (type.word.isInt && unsigned)
				category = "uint";
			else if (type.word.isInt && !unsigned)
				category = "int";
			else if (type.word.isDouble)
				category = "double";
			else if (type.word.isBool)
				category = "bool";
			else if (type.word.isEnum)
			{
				category = "enum";
				val = type.arguments;
			}
			else if (type.word.isString)
			{
				//dont care
			}
			else
				console.warn("unknown type:", type);
			
			if (category)
				fieldTypes[category][name] = val;
				
			//then handle ui modifiers
			for (var j=0; j<this.fields[i].modifiers.length; j++)
			{
				var mod = this.fields[i].modifiers[j];
				if (mod.type == 'comment')
				{
					var arguments = parseComment(mod.groups[0]);
					for (var argument in arguments)
					{
						var params = arguments[argument];
						
						if (argument == '@slider')
						{
							uiTypes.slider[name]='true';
						}
						else if (argument == '@media')
						{
							var mediaTypes = {
								'image': 1,
								'text': 1,
								'youtube': 1,
								//add more here...
							};
							var allowed = {};
							for (var p in params)
							{
								var val = params[p];
								if (p == 'type')
								{
									if (typeof this.fields[val] === 'undefined' ||
										!this.fields[val].type.word.isEnum)
										throw "@media:type argument must refer to a valid Enum/Set field name";
									allowed['type'] = "'"+val+"'";
								}
								else if (typeof mediaTypes[p] !== 'undefined')
									allowed[p] = 'true';
								else
									throw "Unsupported @media type: " + p;
							}
							uiTypes.media[name] = allowed;
						}
						else
							throw "Unknown comment argument: " + token;
					}
				}
			}
		}
		
		sqlInfo.fieldTypes = {};
		for (var categoryType in fieldTypes)
			sqlInfo.fieldTypes[categoryType] = fieldTypes[categoryType];
		
		sqlInfo.uiFieldTypes = {};
		for (var categoryType in uiTypes)
			sqlInfo.uiFieldTypes[categoryType] = uiTypes[categoryType];
		
		//sql references
		var sqlRefs = {
			many2one: {},
			one2many: {},
			one2one: {},
		};
		var fakeSqlRefs = {
			many2one: {},
			one2many: {},
			one2one: {},
		};
		for (var refType in this.ref)
		{
			var tok = refType.split('2');
			var thisPlural = tok[0] == "many";
			var thatPlural = tok[1] == "many";
			
			for (var thatClassName in this.ref[refType])
			{
				var ref = this.ref[refType][thatClassName];
				
				//dont print fake relationships in sql info block
				var col = ref.real ? sqlRefs : fakeSqlRefs;
				
				col[refType][thatClassName] = {
					foreignKey: "'"+ref.thisField+"'",
					referenceKey: "'"+ref.thatField+"'",
				};
			}
		}
		sqlInfo.references = {};
		sqlInfo.foreignReferences = {};
		for (var i in sqlRefs)
			sqlInfo.references[i] = sqlRefs[i];
		for (var i in fakeSqlRefs)
			sqlInfo.foreignReferences[i] = fakeSqlRefs[i];
		
		//inheritance, if any
		sqlInfo.parent = this.parent && this.parent.name ? ("'"+this.parent.name+"'") : 'null';
		sqlInfo.children = {};
		for (var i=0; i<this.children.length; i++)
			sqlInfo.children[this.children[i].name] = 'true';
		
		writeLine("public static $SQLINFO = " + phpize(sqlInfo) + ";");
		writeLine("\n");
		writeLine("// --------------------------------------------------");
		writeLine("\n");
		writeLine("\n");
		
		//class name (fast reflection)
		writeLine("public static $STD_NAME = '"+this.name+"';");
		
		writeLine("// Fields");
		for (var i in this.fields)
		{
			var field = this.fields[i];
			writeLine("private $_"+field.name+";");
		}
		
		writeLine("// Getters");
		
		for (var i=0; i<this.identifiers.length; i++)
		{
			var identifier = this.identifiers[i];
			var methodName = identifier.unique ? "getOne" : "getMany";
			var baseName = identifier.unique ? "get_one" : "get_many";
			var argNames = identifier.fields.join(", ");
			var methodArguments = [];
			var options = {};
			
			//prettier name
			if (identifier.fields.length == 1)
			{
				var x = identifier.fields[0];
				x = x[0].toUpperCase() + x.substring(1);
				methodName += "By" + x;
				
				methodArguments = [ { name:identifier.fields[0], initializer:null } ];
			}
			else
			{
				methodArguments = [];
				for (var j=0; j<identifier.fields.length; j++)
				{
					methodArguments.push({
						name: identifier.fields[j],
						initializer: null,
					});
				}
			}
			
			//pagination
			if (!identifier.unique)
			{
				methodArguments.push({ name: "pageSize", initializer: "null" });
				methodArguments.push({ name: "pageIndex", initializer: "null" });
				options.pageSize = "$pageSize";
				options.pageIndex = "$pageIndex";
			}
			
			//baking arguments string
			var argumentString = [];
			for (var k=0; k<methodArguments.length; k++)
			{
				var a = methodArguments[k];
				var str = "$" + a.name;
				if (a.initializer)
					str += "="+a.initializer;
				
				argumentString.push(str);
			}
			argumentString = argumentString.join(", ");
			
			//baking 1st sub-argument (args->array)
			var arr1={};
			for (var k=0; k<identifier.fields.length; k++)
			{
				arr1[identifier.fields[k]] = "$" + identifier.fields[k];
			}
			arr1 = phpize(arr1);
			
			//baking 2nd sub-argument (options)
			var arr2 = phpize(options);
			
			if (identifier.fields.length == 1)
			{
				writeLine("public static function "+methodName+" ("+argumentString+")");
				block(function()
				{
					writeLine("return self::"+baseName+"("+arr1+", "+arr2+");");
				});
			}
			else
			{
				writeLine("public static function "+methodName+" ("+argumentString+")");
				block(function()
				{
					writeLine("return self::"+baseName+"("+arr1+", "+arr2+");");
				});
			}
		}
		
		//inheritance casting
		writeLine("// Inheritance casts");
		for (var i=0; i<this.children.length; i++)
		{
			var child = this.children[i];
			
			writeLine("public function as"+child.name+" ()");
			block(function()
			{
				writeLine("return new ");
			});
		}
		
		writeLine("// Accessors");
		for (var i in this.fields)
		{
			var field = this.fields[i].name;
			
			writeLine("protected function get_"+field+" ()");
			block(function()
			{
				writeLine("return $this->_"+field+";");
			});
			
			writeLine("protected function set_"+field+" ($value)");
			block(function()
			{
				writeLine("$this->markDirty('"+field+"');");
				writeLine("$this->_"+field+" = $value;");
			});
		}
		
		writeLine("// Constraints");
		for (var refType in this.ref)
		{
			writeLine("// "+refType+" constraints");
			
			var tok = refType.split('2');
			var thisPlural = tok[0] == "many";
			var thatPlural = tok[1] == "many";
			
			for (var thatClassName in this.ref[refType])
			{
				var thatClass = classes[thatClassName];
				var constraint = this.ref[refType][thatClass.name];
				var thatName = thatClass[thatPlural ? "sqlTable":"name"];
				
				//avoid myFoo->myFooBar structures...
				if (thatName.startsWith(this.name))
				{
					thatName = thatName.substring(this.name.length);
				}
				
				if (!thatName)
					throw JSON.stringify(thatClass.sqlTable);
				
				writeLine("public function "+thatName+" ($pageSize=null, $pageIndex=null)");
				block(function()
				{
					writeLine("return self::Ref_"+refType+"("+
						"$this->"+constraint.thisField+", " +
						"'"+thatClass.name+"', '"+constraint.thatField+"', " +
						"array('pageSize' => $pageSize, 'pageIndex' => $pageIndex)" + 
						");"
					);
				});
			}
		}
	});
	
	return code;
};

var classes = {};

var getClassByTable = function (table)
{
	if (!table)
		throw "Table cannot be null";
	
	var className = table2className(table.name);
	if (classes[className])
		return classes[className];
	
	var sqlTable = table.name;
	var identifiers = [];
	
	for (var i=0; i<table.keys.length; i++)
	{
		var key = table.keys[i];
		identifiers.push({
			unique: key.type == "primary" || key.type == "unique",
			primary: key.type == "primary",
			fields: key.fields
		});
	}
	
	var x = new phpClass(className, sqlTable, identifiers);
	
	if (table.parent)
	{
		for (var i in classes)
		{
			if (classes[i].sqlTable === table.parent)
			{
				x.parent = classes[i].name;
				classes[i].children.push(x);
				break;
			}
		}
		if (!x.parent)
			throw "Failed to find parent class: " + table.parent;
	}
	else
	{
		x.parent = "Record";
	}
	
	classes[className]=x;
	return x;
};

for (var tableName in tables)
{
	var table = tables[tableName];
	
	var className = table2className(table.name);
	var obj = getClassByTable(table);
	
	//fields
	for (var i=0; i<table.fields.length; i++)
	{
		var field = table.fields[i];
		obj.addField(field);
	}
	
	//constraints
	for (var i=0; i<table.constraints.length; i++)
	{
		var constraint = table.constraints[i];
		
		try
		{
			var refTable = tables[constraint.reference.table];
			var refClassName = table2className(refTable.name);
		}
		catch (err)
		{
			throw "failed to get reference table: " + constraint.reference.table;
		}
		
		//get this foreign field
		var foreignField = getField(table, constraint.foreignKey);
		if (foreignField == null)
			throw "could not find foreign key: "+constraint.foreignKey;
		var thisUnique = isFieldUnique(table, foreignField);
		
		//get that reference field
		var refField = getField(refTable, constraint.reference.key);
		if (refField == null)
			throw "could not find reference key: "+constraint.foreignKey;
		var thatUnique = isFieldUnique(refTable, refField);
		
		var refClassName = table2className(refTable.name);
		var thatObj = getClassByTable(refTable);
		
		//1 to many
		if (thisUnique && !thatUnique)
		{
			console.log("One "+className+" has many "+refTable.name);
			
			obj.one2many(foreignField.name, thatObj, refField.name);
		}
		//many to 1
		else if (!thisUnique && thatUnique)
		{
			console.log("Many "+table.name+" have one "+table2className(refTable.name));
			
			obj.many2one(foreignField.name, thatObj, refField.name);
		}
		//1 to 1
		else if (thisUnique && thatUnique)
		{
			console.log("One "+className+" has one "+table2className(refTable.name));
			
			obj.one2one(foreignField.name, thatObj, refField.name);
		}
		else
			throw "many to many relationship isnt supported!";
	}
}

//generate php classes

var fileExists = function(file)
{
	try {
		var stats = fs.lstatSync(file);
		return stats.isFile();
	}
	catch (e) {
		return false;
	}
};

for (var i in classes)
{
	var obj = classes[i];
	obj.classPrefix = "SQL_";
	
	//create a new file
	var fileName = outPattern.replace("{className}", obj.classPrefix+obj.name);
	
	var code = obj.serialize();
	
	//save file
	var dataHandle;
	try
	{
		dataHandle = fs.createWriteStream(fileName, {'flags': 'w', 'encoding':'utf8'});
		dataHandle.write(code);
		dataHandle.end();
	}
	catch (e)
	{
		console.error("Failed to write PHP class file: " + fileName);
		process.exit();
	}
	
	//create wrapper to handle user defined stuff
	var wrapper = "" +
		"<?php\n" +
		"class "+obj.name+" extends SQL_"+obj.name+"\n" +
		"{\n" +
		"\t//Put your custom functions here.\n" +
		"}\n";
	
	var wrapperFileName = outPattern.replace("{className}", obj.name);
	
	if (!fileExists(wrapperFileName))
	{
		//save wrapper
		try
		{
			dataHandle = fs.createWriteStream(wrapperFileName, {'flags': 'w', 'encoding':'utf8'});
			dataHandle.write(wrapper);
			dataHandle.end();
		}
		catch (e)
		{
			console.error("Failed to write PHP wrapper class file: " + wrapperFileName);
			process.exit();
		}
	}
	
	console.log("Created classes for type: " + obj.name);
}

console.log("Complete.");
