# coding: utf-8

"""
    Daytona

    Daytona AI platform API Docs

    The version of the OpenAPI document: 1.0
    Contact: support@daytona.com
    Generated by OpenAPI Generator (https://openapi-generator.tech)

    Do not edit the class manually.
"""  # noqa: E501


from __future__ import annotations
import pprint
import re  # noqa: F401
import json

from pydantic import BaseModel, ConfigDict, Field, StrictStr
from typing import Any, ClassVar, Dict, List, Optional
from daytona_api_client_async.models.volume_state import VolumeState
from typing import Optional, Set
from typing_extensions import Self

class VolumeDto(BaseModel):
    """
    VolumeDto
    """ # noqa: E501
    id: StrictStr = Field(description="Volume ID")
    name: StrictStr = Field(description="Volume name")
    organization_id: StrictStr = Field(description="Organization ID", alias="organizationId")
    state: VolumeState = Field(description="Volume state")
    created_at: StrictStr = Field(description="Creation timestamp", alias="createdAt")
    updated_at: StrictStr = Field(description="Last update timestamp", alias="updatedAt")
    last_used_at: Optional[StrictStr] = Field(default=None, description="Last used timestamp", alias="lastUsedAt")
    error_reason: Optional[StrictStr] = Field(description="The error reason of the volume", alias="errorReason")
    additional_properties: Dict[str, Any] = {}
    __properties: ClassVar[List[str]] = ["id", "name", "organizationId", "state", "createdAt", "updatedAt", "lastUsedAt", "errorReason"]

    model_config = ConfigDict(
        populate_by_name=True,
        validate_assignment=True,
        protected_namespaces=(),
    )


    def to_str(self) -> str:
        """Returns the string representation of the model using alias"""
        return pprint.pformat(self.model_dump(by_alias=True))

    def to_json(self) -> str:
        """Returns the JSON representation of the model using alias"""
        # TODO: pydantic v2: use .model_dump_json(by_alias=True, exclude_unset=True) instead
        return json.dumps(self.to_dict())

    @classmethod
    def from_json(cls, json_str: str) -> Optional[Self]:
        """Create an instance of VolumeDto from a JSON string"""
        return cls.from_dict(json.loads(json_str))

    def to_dict(self) -> Dict[str, Any]:
        """Return the dictionary representation of the model using alias.

        This has the following differences from calling pydantic's
        `self.model_dump(by_alias=True)`:

        * `None` is only added to the output dict for nullable fields that
          were set at model initialization. Other fields with value `None`
          are ignored.
        * Fields in `self.additional_properties` are added to the output dict.
        """
        excluded_fields: Set[str] = set([
            "additional_properties",
        ])

        _dict = self.model_dump(
            by_alias=True,
            exclude=excluded_fields,
            exclude_none=True,
        )
        # puts key-value pairs in additional_properties in the top level
        if self.additional_properties is not None:
            for _key, _value in self.additional_properties.items():
                _dict[_key] = _value

        # set to None if last_used_at (nullable) is None
        # and model_fields_set contains the field
        if self.last_used_at is None and "last_used_at" in self.model_fields_set:
            _dict['lastUsedAt'] = None

        # set to None if error_reason (nullable) is None
        # and model_fields_set contains the field
        if self.error_reason is None and "error_reason" in self.model_fields_set:
            _dict['errorReason'] = None

        return _dict

    @classmethod
    def from_dict(cls, obj: Optional[Dict[str, Any]]) -> Optional[Self]:
        """Create an instance of VolumeDto from a dict"""
        if obj is None:
            return None

        if not isinstance(obj, dict):
            return cls.model_validate(obj)

        _obj = cls.model_validate({
            "id": obj.get("id"),
            "name": obj.get("name"),
            "organizationId": obj.get("organizationId"),
            "state": obj.get("state"),
            "createdAt": obj.get("createdAt"),
            "updatedAt": obj.get("updatedAt"),
            "lastUsedAt": obj.get("lastUsedAt"),
            "errorReason": obj.get("errorReason")
        })
        # store additional fields in additional_properties
        for _key in obj.keys():
            if _key not in cls.__properties:
                _obj.additional_properties[_key] = obj.get(_key)

        return _obj


