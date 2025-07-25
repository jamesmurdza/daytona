/* tslint:disable */
/* eslint-disable */
/**
 * Daytona
 * Daytona AI platform API Docs
 *
 * The version of the OpenAPI document: 1.0
 * Contact: support@daytona.com
 *
 * NOTE: This class is auto generated by OpenAPI Generator (https://openapi-generator.tech).
 * https://openapi-generator.tech
 * Do not edit the class manually.
 */

// May contain unused imports in some cases
// @ts-ignore
import type { SnapshotDto } from './snapshot-dto'

/**
 *
 * @export
 * @interface PaginatedSnapshotsDto
 */
export interface PaginatedSnapshotsDto {
  /**
   *
   * @type {Array<SnapshotDto>}
   * @memberof PaginatedSnapshotsDto
   */
  items: Array<SnapshotDto>
  /**
   *
   * @type {number}
   * @memberof PaginatedSnapshotsDto
   */
  total: number
  /**
   *
   * @type {number}
   * @memberof PaginatedSnapshotsDto
   */
  page: number
  /**
   *
   * @type {number}
   * @memberof PaginatedSnapshotsDto
   */
  totalPages: number
}
