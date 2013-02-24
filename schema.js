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
	"tinyint" : { args: 1 },
	"smallint" : { args: 1 },
	"mediumint" : { args: 1 },
	"int" : { args: 1 },
	"bigint" : { args: 1 },
	"float" : { args: 2 },
	"double" : { args: 2 },
	"decimal" : { args: 2 },
	"bit" : { args: 1 },
	"char" : { args: 1 },
	"varchar" : { args: 1 },
	"tinytext" : { args: 0 },
	"text" : { args: 0 },
	"mediumtext" : { args: 0 },
	"longtext" : { args: 0 },
	"binary" : { args: 1 },
	"varbinary" : { args: 1 },
	"tinyblob" : { args: 0 },
	"blob" : { args: 0 },
	"mediumblob" : { args: 0 },
	"longblob" : { args: 0 },
	"enum" : { args: 65535 },
	"set" : { args: 64 },
	"date" : { args: 0 },
	"datetime" : { args: 0 },
	"time" : { args: 0 },
	"timestamp" : { args: 0 },
	"year" : { args: 0 },
};
requestParser.modifiers = {
	"not null":			/NOT NULL/i,
	"auto increment":	/AUTO_INCREMENT/i,
	"collate":			/COLLATE\s+[^\s]+/i,
	"default":			/DEFAULT\s+'[^']*'/i,
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
			ret.arguments[i] = parseInt(sub[i]);
		
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
	
	//TODO: parse table modifiers and properties
	
	return {
		name: tableName,
		fields: tableFields,
		keys: tableKeys,
		constraints: tableConstraints,
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
	this.sqlTable=sqlTable;
	this.fields = {};
	this.ref = {
		one2one: {},
		one2many: {},
		many2one: {}
	};
	this.identifiers = identifiers;
};
phpClass.prototype.addField = function(fieldName)
{
	this.fields[fieldName] = fieldName;
};
phpClass.prototype.one2one = function(thisField, thatClass, thatField)
{
	this.ref.one2one[thatClass.name] = { thisField:thisField, thatField:thatField };
	thatClass.ref.one2one[this.name] = { thisField:thatField, thatField:thisField };
};
phpClass.prototype.one2many = function(thisField, thatClass, thatField)
{
	this.ref.one2many[thatClass.name] = { thisField:thisField, thatField:thatField };
	thatClass.ref.many2one[this.name] = { thisField:thatField, thatField:thisField };
};
phpClass.prototype.many2one = function(thisField, thatClass, thatField)
{
	this.ref.many2one[thatClass.name] = { thisField:thisField, thatField:thatField };
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
	
	writeLine("<?php");
	writeLine("class "+this.name+" extends Record");
	block(function()
	{
		writeLine("// SQL info");
		
		//table name
		writeLine("public static $_sqlTable = '"+this.sqlTable+"';");
		
		//field names
		write("public static $_sqlFields = array(");
		var fnames=[];
		for (var i in this.fields)
			fnames.push(this.fields[i]);
		write("'" + fnames.join("', '") + "'");
		writeLine(");");
		
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
		write("public static $_sqlIdentifier = array(");
		write("'" + identifier.fields.join("', '") + "'");
		writeLine(");");
		
		writeLine("public static $STD_NAME = '"+this.name+"';");
		
		writeLine("// Fields");
		for (var i in this.fields)
		{
			var field = this.fields[i];
			writeLine("private $_"+field+";");
		}
		
		writeLine("// Getters");
		for (var i=0; i<this.identifiers.length; i++)
		{
			var identifier = this.identifiers[i];
			var methodName = identifier.unique ? "getOne" : "getMany";
			var baseName = identifier.unique ? "get_one" : "get_many";
			var argNames = identifier.fields.join(", ");
			var methodArgument = "args";
			
			//prettier name
			if (identifier.fields.length == 1)
			{
				var x = identifier.fields[0];
				x = x[0].toUpperCase() + x.substring(1);
				methodName += "By" + x;
				
				methodArgument = identifier.fields[0];
			}
			
			if (identifier.fields.length == 1)
			{
				writeLine("public static function "+methodName+" ($"+methodArgument+")");
				block(function()
				{
					writeLine("return self::"+baseName+"(array('"+methodArgument+"' => $"+methodArgument+"));");
				});
			}
			else
			{
				methodArgument = "$"+identifier.fields.join(", $");
				
				writeLine("public static function "+methodName+" ("+methodArgument+")");
				block(function()
				{
					writeLine("return self::"+baseName+"(array(");
					for (var k=0; k<identifier.fields.length; k++)
					{
						var field = identifier.fields[k];
						write("'"+field+"' => $"+field);
						if (k < identifier.fields.length-1)
						{
							write(",");
						}
						writeLine("");
					}
					writeLine("));");
				});
			}
		}
		
		writeLine("// Accessors");
		for (var i in this.fields)
		{
			var field = this.fields[i];
			
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
				
				writeLine("protected function get_"+thatName+" ()");
				block(function()
				{
					writeLine("return self::Ref_"+refType+"("+
						"$this->"+constraint.thisField+", " +
						"'"+thatClass.name+"', '"+constraint.thatField+"');"
					);
				});
			}
		}
	});
	
	return code;
};

var classes = {};

var getClass = function(className, sqlTable, identifiers)
{
	if (classes[className])
		return classes[className];
	
	var x = new phpClass(name,sqlTable,identifiers);
	classes[className]=x;
	return x;
};
var getClassByTable = function (table)
{
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
		obj.addField(field.name);
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

for (var i in classes)
{
	var obj = classes[i];
	
	//create a new file
	var fileName = outPattern.replace("{className}", obj.name);
	
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
	
	console.log("Created class " + obj.name);
}
