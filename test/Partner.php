<?php
class Partner extends Record
{
	// SQL info
	public static $_sqlTable = 'Partners';
	public static $_sqlFields = array('id', 'email', 'firstname', 'lastname', 'password');
	public static $_sqlIdentifier = array('id');
	public static $STD_NAME = 'Partner';
	// Fields
	private $_id;
	private $_email;
	private $_firstname;
	private $_lastname;
	private $_password;
	// Getters
	public static function getOneById ($id)
	{
		return self::get_one(array('id' => $id));
	}
	public static function getOneByEmail ($email)
	{
		return self::get_one(array('email' => $email));
	}
	// Accessors
	protected function get_id ()
	{
		return $this->_id;
	}
	protected function set_id ($value)
	{
		$this->markDirty('id');
		$this->_id = $value;
	}
	protected function get_email ()
	{
		return $this->_email;
	}
	protected function set_email ($value)
	{
		$this->markDirty('email');
		$this->_email = $value;
	}
	protected function get_firstname ()
	{
		return $this->_firstname;
	}
	protected function set_firstname ($value)
	{
		$this->markDirty('firstname');
		$this->_firstname = $value;
	}
	protected function get_lastname ()
	{
		return $this->_lastname;
	}
	protected function set_lastname ($value)
	{
		$this->markDirty('lastname');
		$this->_lastname = $value;
	}
	protected function get_password ()
	{
		return $this->_password;
	}
	protected function set_password ($value)
	{
		$this->markDirty('password');
		$this->_password = $value;
	}
	// Constraints
	// one2one constraints
	// one2many constraints
	protected function get_Venues ()
	{
		return self::Ref_one2many($this->id, 'Venue', 'partnerId');
	}
	// many2one constraints
}
