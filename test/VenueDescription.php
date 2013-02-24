<?php
class VenueDescription extends Record
{
	// SQL info
	public static $_sqlTable = 'VenueDescriptions';
	public static $_sqlFields = array('venueId', 'languageId', 'text');
	public static $_sqlIdentifier = array('venueId', 'languageId');
	public static $STD_NAME = 'VenueDescription';
	// Fields
	private $_venueId;
	private $_languageId;
	private $_text;
	// Getters
	public static function getOne ($venueId, $languageId)
	{
		return self::get_one(array(
		'venueId' => $venueId,
		'languageId' => $languageId
		));
	}
	public static function getManyByLanguageId ($languageId)
	{
		return self::get_many(array('languageId' => $languageId));
	}
	public static function getManyByVenueId ($venueId)
	{
		return self::get_many(array('venueId' => $venueId));
	}
	// Accessors
	protected function get_venueId ()
	{
		return $this->_venueId;
	}
	protected function set_venueId ($value)
	{
		$this->markDirty('venueId');
		$this->_venueId = $value;
	}
	protected function get_languageId ()
	{
		return $this->_languageId;
	}
	protected function set_languageId ($value)
	{
		$this->markDirty('languageId');
		$this->_languageId = $value;
	}
	protected function get_text ()
	{
		return $this->_text;
	}
	protected function set_text ($value)
	{
		$this->markDirty('text');
		$this->_text = $value;
	}
	// Constraints
	// one2one constraints
	// one2many constraints
	// many2one constraints
	protected function get_Venue ()
	{
		return self::Ref_many2one($this->venueId, 'Venue', 'id');
	}
	protected function get_Language ()
	{
		return self::Ref_many2one($this->languageId, 'Language', 'id');
	}
}
