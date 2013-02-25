<?php

abstract class Record
{
	//static sql-related
	private static $connection = null;
	public static function connect ($args)
	{
		if (self::$connection)
		{
			throw new Exception("Attempted to connect twice to mysql");
		}
		
		$args=(object)$args;
		self::$connection = mysql_connect($args->host, $args->login, $args->password);
		if (!self::$connection)
			return false;
		
		if (!mysql_select_db($args->database, self::$connection))
			return false;
		
		return true;
	}
	private static function _where_identifier ($args)
	{
		$str = "WHERE ";
		foreach (static::$_sqlIdentifier as $field)
		{
			$str .= "`$field` = " . self::escape( self::encodeSqlValue($field, $args->$field) ) . " AND ";
		}
		$str = substr($str, 0, -4);
		return $str;
	}
	
	//this record
	private $_dirtyFields = array();
	private $_new = true;
	public function dirty ()
	{
		return count($this->_dirtyFields) > 0 || $this->_new;
	}
	protected function markDirty ($field)
	{
		$this->_dirtyFields[$field]=true;
	}
	
	//this sql related
	private function insert()
	{
		//invalidate cache
		self::$_sqlQueryCache=array();
		
		$tok = array();
		foreach (static::$_sqlFields as $field)
		{
			$val = $this->$field;
			$tok[] = self::escape( self::encodeSqlValue($field,$val) );
		}
		$values = implode(", ", $tok);
		$fieldNames = "`" . implode("`, `", static::$_sqlFields) . "`";
		
		$sql = "insert into `".static::$_sqlTable."` ($fieldNames) VALUES ($values)";
		
		$ok = self::sql($sql) !== false;
		if ($ok)
		{
			//auto increment value
			$id = mysql_insert_id(self::$connection);
			if ($id > 0)
			{
				$idField = static::$_sqlIdentifier;
				if (count($idField) !== 1)
				{
					throw new Exception("FixMe: cannot guess AUTO_INCREMENT field!");
				}
				$idField = $idField[0];
				$this->$idField = $id;
			}
			
			$this->_new = false;
			$this->_dirtyFields = array();
		}
		
		return $ok;
	}
	private function update()
	{
		//invalidate cache
		self::$_sqlQueryCache=array();
		
		$sql = "update `".static::$_sqlTable."` SET ";
		
		$tok = array();
		foreach (static::$_sqlFields as $field)
		{
			$dirty = isset($this->_dirtyFields[$field]);
			if ($dirty)
			{
				$val = $this->$field;
				$tok[] = "`$field` = " . self::escape( self::encodeSqlValue($val) );
			}
		}
		$sql .= implode(", ", $tok);
		$sql .= " " . self::_where_identifier($this);
		
		$ok = self::sql($sql) !== false;
		if ($ok)
		{
			$this->_new = false;
			$this->_dirtyFields = array();
		}
		
		return $ok;
	}
	public function delete()
	{
		if ($this->_new)
			return false;
		
		//invalidate cache
		self::$_sqlQueryCache=array();
		
		$sql = "delete from `".static::$_sqlTable."` ";
		$sql .= self::_where_identifier($this);
		
		return self::sql($sql) !== false;
	}
	
	public function commit ()
	{
		if (!$this->dirty())
			return true;
		
		if ($this->_new)
			return $this->insert();
		else
			return $this->update();
	}
	
	//sql helpers
	private static function escape ($str)
	{
		if ($str === null)
			return "NULL";
		else
			return "'" . mysql_real_escape_string($str) . "'";
	}
	private static $_sqlQueryCache = array();
	public static $onRequest = null;
	private static function sql ($sql)
	{
		if (!self::$connection)
			throw new Exception("Cannot execute queries: not connected to database");
		
		//cache
		$cached = isset(self::$_sqlQueryCache[$sql]);
		
		//debugging
		if (self::$onRequest !== null)
		{
			$fn=self::$onRequest;
			$debug = $sql;
			if ($cached)
				$debug = "Cache hit: " . $debug;
			$fn($debug);
			unset($fn);
		}
		
		if ($cached)
			return self::$_sqlQueryCache[$sql];
		
		$res = mysql_query($sql, self::$connection);
		
		if ($res === true)
		{
			return true;
		}
		
		if (!$res)
			throw new Exception("SQL Error:\n".$sql."\n".mysql_error());
		
		$ret = array();
		while ($x = mysql_fetch_array($res))
		{
			$ret[] = $x;
		}
		
		//cache it
		self::$_sqlQueryCache[$sql] = $ret; 
		
		return $ret;
	}
	
	public function __construct ($sqlRow = null)
	{
		if ($sqlRow === null)
		{
			return;
		}
		
		//internal
		foreach (static::$_sqlFields as $field)
		{
			$val = $sqlRow[$field];
			$this->$field = self::decodeSqlValue($field,$val);
		}
		$this->_dirtyFields = array();
	}
	
	//getters
	protected static function get_one ($args)
	{
		$sql = "select * from ".static::$_sqlTable." where ";
		
		$tok = array();
		foreach ($args as $key=>$val)
		{
			$tok[] = "`$key` = " . self::escape( self::encodeSqlValue($key,$val) );
		}
		$sql .= implode(" AND ", $tok);
		
		$sql .= " LIMIT 1";
		$obj = self::sql($sql);
		
		if (count($obj) == 0)
			return null;
		
		$obj = $obj[0];
		
		$type=static::$STD_NAME;
		$obj = new $type($obj);
		$obj->_new = false;
		return $obj;
	}
	protected static function get_many ($args, $options)
	{
		$sql = "select * from ".static::$_sqlTable." where ";
		
		$tok = array();
		foreach ($args as $key=>$val)
		{
			$tok[] = "`$key` = " . self::escape( self::encodeSqlValue($key,$val) );
		}
		$sql .= implode(" AND ", $tok);
		
		if (isset($options['pageSize']))
		{
			$pageSize = (int)$options['pageSize'];
			$pageIndex = isset($options['pageIndex']) ? ((int)$options['pageIndex']) : 0;
			$sql .= " LIMIT ".($pageIndex*$pageSize).", ".$pageSize;
		}
		
		$objects = self::sql($sql);
		$ret = array();
		$type=static::$STD_NAME;
		foreach ($objects as $o)
		{
			$obj = new $type($o);
			$obj->_new = false;
			$ret[] = $obj;
		}
		return $ret;
	}
	
	//constraints
	protected static function Ref_one2many ($val, $thatClass, $thatField, $options)
	{
		$getter = "getManyBy" . strtoupper($thatField{0}) . substr($thatField,1);
		return $thatClass::$getter($val, @$options['pageSize'], @$options['pageIndex']);
	}
	protected static function Ref_one2one ($val, $thatClass, $thatField, $options)
	{
		$getter = "getOneBy" . strtoupper($thatField{0}) . substr($thatField,1);
		return $thatClass::$getter($val, @$options['pageSize'], @$options['pageIndex']);
	}
	protected static function Ref_many2one ($val, $thatClass, $thatField, $options)
	{
		$getter = "getOneBy" . strtoupper($thatField{0}) . substr($thatField,1);
		return $thatClass::$getter($val, @$options['pageSize'], @$options['pageIndex']);
	}
	
	//accessors
	protected function Accessible($name)
	{
		if ((method_exists($this, "set_$name")) || 
			(method_exists($this, "get_$name")))
			return true;
 
		throw new Exception((property_exists($this, $name) == false) 
					? "Property $name does not exist"
					: "Property $name not accessible");
	}
 
	public function __get($name) 
	{
		if ($this->Accessible($name))
		{
			if (method_exists($this, "get_$name"))
				return $this->{"get_$name"}();
			else
				throw new Exception("Writeonly Property $name");	
		}
	}
 
	public function __set($name, $value)
	{
		if ($this->Accessible($name))
		{
			if (method_exists($this, "set_$name"))
				$this->{"set_$name"}( $value );
			else
				throw new Exception("Readonly Property $name");
		}
	}
	
	//data type formatters
	private static function toDatetime ($x)
	{
		return date('Y-m-d H:i:s', $x);
	}
	private static function fromDatetime ($x)
	{
		return strtotime('Y-m-d H:i:s', $x . " GMT");
	}
	
	private static function decodeSqlValue ($field, $value)
	{
		if (isset(static::$_datetime_fields[$field]))
			return self::fromDatetime($value);
		//TODO: add more decoding types here
		else
			return $value;
	}
	private static function encodeSqlValue ($field, $value)
	{
		if ($value === null)
			return "NULL";
		else if (isset(static::$_datetime_fields[$field]))
			return self::toDatetime($value);
		//TODO: add more decoding types here
		else
			return $value;
	}
}
