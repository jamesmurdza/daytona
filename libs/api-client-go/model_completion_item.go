/*
Daytona

Daytona AI platform API Docs

API version: 1.0
Contact: support@daytona.com
*/

// Code generated by OpenAPI Generator (https://openapi-generator.tech); DO NOT EDIT.

package apiclient

import (
	"bytes"
	"encoding/json"
	"fmt"
)

// checks if the CompletionItem type satisfies the MappedNullable interface at compile time
var _ MappedNullable = &CompletionItem{}

// CompletionItem struct for CompletionItem
type CompletionItem struct {
	Label         string                 `json:"label"`
	Kind          *float32               `json:"kind,omitempty"`
	Detail        *string                `json:"detail,omitempty"`
	Documentation map[string]interface{} `json:"documentation,omitempty"`
	SortText      *string                `json:"sortText,omitempty"`
	FilterText    *string                `json:"filterText,omitempty"`
	InsertText    *string                `json:"insertText,omitempty"`
}

type _CompletionItem CompletionItem

// NewCompletionItem instantiates a new CompletionItem object
// This constructor will assign default values to properties that have it defined,
// and makes sure properties required by API are set, but the set of arguments
// will change when the set of required properties is changed
func NewCompletionItem(label string) *CompletionItem {
	this := CompletionItem{}
	this.Label = label
	return &this
}

// NewCompletionItemWithDefaults instantiates a new CompletionItem object
// This constructor will only assign default values to properties that have it defined,
// but it doesn't guarantee that properties required by API are set
func NewCompletionItemWithDefaults() *CompletionItem {
	this := CompletionItem{}
	return &this
}

// GetLabel returns the Label field value
func (o *CompletionItem) GetLabel() string {
	if o == nil {
		var ret string
		return ret
	}

	return o.Label
}

// GetLabelOk returns a tuple with the Label field value
// and a boolean to check if the value has been set.
func (o *CompletionItem) GetLabelOk() (*string, bool) {
	if o == nil {
		return nil, false
	}
	return &o.Label, true
}

// SetLabel sets field value
func (o *CompletionItem) SetLabel(v string) {
	o.Label = v
}

// GetKind returns the Kind field value if set, zero value otherwise.
func (o *CompletionItem) GetKind() float32 {
	if o == nil || IsNil(o.Kind) {
		var ret float32
		return ret
	}
	return *o.Kind
}

// GetKindOk returns a tuple with the Kind field value if set, nil otherwise
// and a boolean to check if the value has been set.
func (o *CompletionItem) GetKindOk() (*float32, bool) {
	if o == nil || IsNil(o.Kind) {
		return nil, false
	}
	return o.Kind, true
}

// HasKind returns a boolean if a field has been set.
func (o *CompletionItem) HasKind() bool {
	if o != nil && !IsNil(o.Kind) {
		return true
	}

	return false
}

// SetKind gets a reference to the given float32 and assigns it to the Kind field.
func (o *CompletionItem) SetKind(v float32) {
	o.Kind = &v
}

// GetDetail returns the Detail field value if set, zero value otherwise.
func (o *CompletionItem) GetDetail() string {
	if o == nil || IsNil(o.Detail) {
		var ret string
		return ret
	}
	return *o.Detail
}

// GetDetailOk returns a tuple with the Detail field value if set, nil otherwise
// and a boolean to check if the value has been set.
func (o *CompletionItem) GetDetailOk() (*string, bool) {
	if o == nil || IsNil(o.Detail) {
		return nil, false
	}
	return o.Detail, true
}

// HasDetail returns a boolean if a field has been set.
func (o *CompletionItem) HasDetail() bool {
	if o != nil && !IsNil(o.Detail) {
		return true
	}

	return false
}

// SetDetail gets a reference to the given string and assigns it to the Detail field.
func (o *CompletionItem) SetDetail(v string) {
	o.Detail = &v
}

// GetDocumentation returns the Documentation field value if set, zero value otherwise.
func (o *CompletionItem) GetDocumentation() map[string]interface{} {
	if o == nil || IsNil(o.Documentation) {
		var ret map[string]interface{}
		return ret
	}
	return o.Documentation
}

// GetDocumentationOk returns a tuple with the Documentation field value if set, nil otherwise
// and a boolean to check if the value has been set.
func (o *CompletionItem) GetDocumentationOk() (map[string]interface{}, bool) {
	if o == nil || IsNil(o.Documentation) {
		return map[string]interface{}{}, false
	}
	return o.Documentation, true
}

// HasDocumentation returns a boolean if a field has been set.
func (o *CompletionItem) HasDocumentation() bool {
	if o != nil && !IsNil(o.Documentation) {
		return true
	}

	return false
}

// SetDocumentation gets a reference to the given map[string]interface{} and assigns it to the Documentation field.
func (o *CompletionItem) SetDocumentation(v map[string]interface{}) {
	o.Documentation = v
}

// GetSortText returns the SortText field value if set, zero value otherwise.
func (o *CompletionItem) GetSortText() string {
	if o == nil || IsNil(o.SortText) {
		var ret string
		return ret
	}
	return *o.SortText
}

// GetSortTextOk returns a tuple with the SortText field value if set, nil otherwise
// and a boolean to check if the value has been set.
func (o *CompletionItem) GetSortTextOk() (*string, bool) {
	if o == nil || IsNil(o.SortText) {
		return nil, false
	}
	return o.SortText, true
}

// HasSortText returns a boolean if a field has been set.
func (o *CompletionItem) HasSortText() bool {
	if o != nil && !IsNil(o.SortText) {
		return true
	}

	return false
}

// SetSortText gets a reference to the given string and assigns it to the SortText field.
func (o *CompletionItem) SetSortText(v string) {
	o.SortText = &v
}

// GetFilterText returns the FilterText field value if set, zero value otherwise.
func (o *CompletionItem) GetFilterText() string {
	if o == nil || IsNil(o.FilterText) {
		var ret string
		return ret
	}
	return *o.FilterText
}

// GetFilterTextOk returns a tuple with the FilterText field value if set, nil otherwise
// and a boolean to check if the value has been set.
func (o *CompletionItem) GetFilterTextOk() (*string, bool) {
	if o == nil || IsNil(o.FilterText) {
		return nil, false
	}
	return o.FilterText, true
}

// HasFilterText returns a boolean if a field has been set.
func (o *CompletionItem) HasFilterText() bool {
	if o != nil && !IsNil(o.FilterText) {
		return true
	}

	return false
}

// SetFilterText gets a reference to the given string and assigns it to the FilterText field.
func (o *CompletionItem) SetFilterText(v string) {
	o.FilterText = &v
}

// GetInsertText returns the InsertText field value if set, zero value otherwise.
func (o *CompletionItem) GetInsertText() string {
	if o == nil || IsNil(o.InsertText) {
		var ret string
		return ret
	}
	return *o.InsertText
}

// GetInsertTextOk returns a tuple with the InsertText field value if set, nil otherwise
// and a boolean to check if the value has been set.
func (o *CompletionItem) GetInsertTextOk() (*string, bool) {
	if o == nil || IsNil(o.InsertText) {
		return nil, false
	}
	return o.InsertText, true
}

// HasInsertText returns a boolean if a field has been set.
func (o *CompletionItem) HasInsertText() bool {
	if o != nil && !IsNil(o.InsertText) {
		return true
	}

	return false
}

// SetInsertText gets a reference to the given string and assigns it to the InsertText field.
func (o *CompletionItem) SetInsertText(v string) {
	o.InsertText = &v
}

func (o CompletionItem) MarshalJSON() ([]byte, error) {
	toSerialize, err := o.ToMap()
	if err != nil {
		return []byte{}, err
	}
	return json.Marshal(toSerialize)
}

func (o CompletionItem) ToMap() (map[string]interface{}, error) {
	toSerialize := map[string]interface{}{}
	toSerialize["label"] = o.Label
	if !IsNil(o.Kind) {
		toSerialize["kind"] = o.Kind
	}
	if !IsNil(o.Detail) {
		toSerialize["detail"] = o.Detail
	}
	if !IsNil(o.Documentation) {
		toSerialize["documentation"] = o.Documentation
	}
	if !IsNil(o.SortText) {
		toSerialize["sortText"] = o.SortText
	}
	if !IsNil(o.FilterText) {
		toSerialize["filterText"] = o.FilterText
	}
	if !IsNil(o.InsertText) {
		toSerialize["insertText"] = o.InsertText
	}
	return toSerialize, nil
}

func (o *CompletionItem) UnmarshalJSON(data []byte) (err error) {
	// This validates that all required properties are included in the JSON object
	// by unmarshalling the object into a generic map with string keys and checking
	// that every required field exists as a key in the generic map.
	requiredProperties := []string{
		"label",
	}

	allProperties := make(map[string]interface{})

	err = json.Unmarshal(data, &allProperties)

	if err != nil {
		return err
	}

	for _, requiredProperty := range requiredProperties {
		if _, exists := allProperties[requiredProperty]; !exists {
			return fmt.Errorf("no value given for required property %v", requiredProperty)
		}
	}

	varCompletionItem := _CompletionItem{}

	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	err = decoder.Decode(&varCompletionItem)

	if err != nil {
		return err
	}

	*o = CompletionItem(varCompletionItem)

	return err
}

type NullableCompletionItem struct {
	value *CompletionItem
	isSet bool
}

func (v NullableCompletionItem) Get() *CompletionItem {
	return v.value
}

func (v *NullableCompletionItem) Set(val *CompletionItem) {
	v.value = val
	v.isSet = true
}

func (v NullableCompletionItem) IsSet() bool {
	return v.isSet
}

func (v *NullableCompletionItem) Unset() {
	v.value = nil
	v.isSet = false
}

func NewNullableCompletionItem(val *CompletionItem) *NullableCompletionItem {
	return &NullableCompletionItem{value: val, isSet: true}
}

func (v NullableCompletionItem) MarshalJSON() ([]byte, error) {
	return json.Marshal(v.value)
}

func (v *NullableCompletionItem) UnmarshalJSON(src []byte) error {
	v.isSet = true
	return json.Unmarshal(src, &v.value)
}
