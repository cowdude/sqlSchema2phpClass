<?php

class MySQLConnection
{
	private $_select;
	private $_from;
	private $_where;
	private $_having;
	private $_orderBy;
	private $_groupBy;
	private $_limit;
	
	private $_unions;
	
	private $connection;
	
	public function __construct($args)
	{
		$this->reset();
		
		$args=(object)$args;
		$this->connection = mysql_connect($args->host, $args->login, $args->password);
		if (!$this->connection)
			throw new Exception("MySQL connection failed");
		
		if (!mysql_select_db($args->database, $this->connection))
			throw new Exception("MySQL select DB failed");
	}
	
	public function reset()
	{
		$this->_select=array();
		$this->_from=null;
		$this->_where=null;
		$this->_having=null;
		$this->_sortBy=null;
		$this->_groupBy=null;
		$this->_limit=null;
		
		$this->_unions=array();
	}
	
	public function select($source, $what)
	{
		$this->_select[] = "$source.$what";
		return $this;
	}
	
	public function from($source)
	{
		$this->_from = $source;
		return $this;
	}
	
	public function leftJoin ($source, $thisKey, $thatKey)
	{
		$this->_unions[$source] = array(
			'expr' => 'LEFT JOIN',
			'this' => $thisKey,
			'that' => $thatKey
		);
		return $this;
	}
	public function rightJoin ($source, $thisKey, $thatKey)
	{
		$this->_unions[$source] = array(
			'expr' => 'RIGHT JOIN',
			'this' => $thisKey,
			'that' => $thatKey
		);
		return $this;
	}
	public function union ($source, $thisKey, $thatKey)
	{
		$this->_unions[$source] = array(
			'expr' => 'UNION',
			'this' => $thisKey,
			'that' => $thatKey
		);
		return $this;
	}
	
	private static function format ($format, $vars=array())
	{
		$len = strlen($format);
		$j=0;
		$numVars = count($vars);
		$str = '';
		
		if (!is_array($vars))
			$vars=array($vars);
		
		for ($i=0; $i<$len; $i++)
		{
			$c = $format{$i};
			if ($c == '?')
			{
				if ($j == $numVars)
					throw new Exception("Invalid number of variables in statement: ".$format);
				$arg = mysql_real_escape_string(''.$vars[$j++]);
				$str .= "'$arg'";
			}
			else
			{
				$str .= $c;
			}
		}
		return $str;
	}
	
	public function where($format, $vars=array())
	{
		$this->_where = self::format($format,$vars);
		return $this;
	}
	
	public function having($format, $vars=array())
	{
		$this->_having = self::format($format,$vars);
		return $this;
	}
	
	public function limit($from, $length)
	{
		$this->_limit = ((int)$from).','.((int)$length);
		return $this;
	}
	
	public function groupBy($what)
	{
		$this->_groupBy = $what;
		return $this;
	}
	
	public function orderBy($what, $order='ASC')
	{
		$this->_orderBy = "$what $order";
		return $this;
	}
	
	protected function prepare ()
	{
		$fields = implode(', ', $this->_select);
		$query = 'SELECT ' .$fields. ' FROM ' . $this->_from;
		
		foreach ($this->_unions as $source=>$join)
		{
			$query .= 
				' '.$join['expr'].' '.$source.
				' ON '.$source.'.'.$join['that'].' = '.
				$this->_from.'.'.$join['this'];
		}
		
		if ($this->_where)
			$query .= ' WHERE ' . $this->_where;
		
		if ($this->_groupBy)
			$query .= ' GROUPBY ' . $this->_groupBy;
		
		if ($this->_having)
			$query .= ' HAVING ' . $this->_having;
		
		if ($this->_orderBy)
			$query .= ' ORDER BY ' . $this->_orderBy;
		
		if ($this->_limit)
			$query .= ' LIMIT ' . $this->_limit;
		
		return $query;
	}
	
	private function query ()
	{
		$sql = $this->prepare();
		$result = mysql_query($sql);
		$err=mysql_error();
		$this->reset();
		if ($err)
			throw new Exception ("MySQL error: " . $err);
		return $result;
	}
	
	public function one ()
	{
		$result = $this->query();
		return mysql_fetch_array($result);
	}
	public function many ()
	{
		$result = $this->query();
		$ret=array();
		while ($x = mysql_fetch_array($result))
			$ret[] = $x;
		return $ret;
	}
}
