<?php

require "Record.class.php";
require "Venue.php";
require "VenueDescription.php";
require "Partner.php";
require "Language.php";

require "db.php";

//connect...
Record::Connect($db) or die("sql conn failed");
unset($db);

//debug
$log=array();
Record::$onRequest = function($sql)
{
	global $log;
	$log[]=$sql;
};

echo "Hey!\n";

$partner = Partner::getOneById(1);

foreach ($partner->Venues as $venue)
{
	echo "$venue->id: ";
	if (count($venue->Descriptions) == 0)
	{
		echo "NOT SET!!\n";
	}
	else
	{
		$descr = $venue->Descriptions[0];
		$x = $descr->Language->name;
		echo "$venue->id: $descr->text (in $x, please!)\n";
		
		//update test
		$descr->text .= "\nupdate text...";
		$descr->commit() or die("update failed");
	}
}

//insert test
$obj = new Venue();
$obj->partnerId = $partner->id;
$obj->commit() or die("commit failed");

$obj->delete() or die("delete failed");

print "-------------------------\n";
print implode("\n", $log);
