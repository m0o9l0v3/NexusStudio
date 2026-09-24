import { apiJson } from './client'
import type { components } from './schema'

type Schemas = components['schemas']

export type CategoryListDetail = Schemas['CategoryListDetail']
export type CategoryListItem = Schemas['CategoryListItem']
export type CategoryDraft = Schemas['CategoryDraft']
export type CategoryConflict = Schemas['ReferenceConflictOfCategoryListDetail']

export function getCategories(): Promise<CategoryListDetail> {
  return apiJson<CategoryListDetail>('GET', '/api/categories')
}

/** 配列の順序がカテゴリの表示順になる。既存のカテゴリは削除できない。 */
export function saveCategories(operationId: string, rowVersion: number, items: CategoryDraft[]): Promise<CategoryListDetail> {
  return apiJson<CategoryListDetail>('PUT', '/api/categories', { operationId, rowVersion, items })
}
