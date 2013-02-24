<?php
class Language extends Record
{
	// SQL info
	public static $_sqlTable = 'Languages';
	public static $_sqlFields = array('id', 'name', 'localizedName', 'enabled');
	public static $_sqlIdentifier = array('id');
	public static $STD_NAME = 'Language';
	// Fields
	private $_id;
	private $_name;
	private $_localizedName;
	private $_enabled;
	// Getters
	public static function getOneById ($id)
	{
		return self::get_one(array('id' => $id));
	}
	public static function getOneByName ($name)
	{
		return self::get_one(array('name' => $name));
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
	protected function get_name ()
	{
		return $this->_name;
	}
	protected function set_name ($value)
	{
		$this->markDirty('name');
		$this->_name = $value;
	}
	protected function get_localizedName ()
	{
		return $this->_localizedName;
	}
	protected function set_localizedName ($value)
	{
		$this->markDirty('localizedName');
		$this->_localizedName = $value;
	}
	protected function get_enabled ()
	{
		return $this->_enabled;
	}
	protected function set_enabled ($value)
	{
		$this->markDirty('enabled');
		$this->_enabled = $value;
	}
	// Constraints
	// one2one constraints
	// one2many constraints
	protected function get_VenueAccomodations ()
	{
		return self::Ref_one2many($this->id, 'VenueAccomodation', 'languageId');
	}
	protected function get_VenueActivities ()
	{
		return self::Ref_one2many($this->id, 'VenueActivity', 'languageId');
	}
	protected function get_VenueDescriptions ()
	{
		return self::Ref_one2many($this->id, 'VenueDescription', 'languageId');
	}
	// many2one constraints
}
