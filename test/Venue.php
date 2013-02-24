<?php
class Venue extends Record
{
	// SQL info
	public static $_sqlTable = 'Venues';
	public static $_sqlFields = array('id', 'partnerId');
	public static $_sqlIdentifier = array('id');
	public static $STD_NAME = 'Venue';
	// Fields
	private $_id;
	private $_partnerId;
	// Getters
	public static function getOneById ($id)
	{
		return self::get_one(array('id' => $id));
	}
	public static function getManyByPartnerId ($partnerId)
	{
		return self::get_many(array('partnerId' => $partnerId));
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
	protected function get_partnerId ()
	{
		return $this->_partnerId;
	}
	protected function set_partnerId ($value)
	{
		$this->markDirty('partnerId');
		$this->_partnerId = $value;
	}
	// Constraints
	// one2one constraints
	// one2many constraints
	protected function get_Accomodations ()
	{
		return self::Ref_one2many($this->id, 'VenueAccomodation', 'venueId');
	}
	protected function get_Activities ()
	{
		return self::Ref_one2many($this->id, 'VenueActivity', 'venueId');
	}
	protected function get_Descriptions ()
	{
		return self::Ref_one2many($this->id, 'VenueDescription', 'venueId');
	}
	// many2one constraints
	protected function get_Partner ()
	{
		return self::Ref_many2one($this->partnerId, 'Partner', 'id');
	}
}
