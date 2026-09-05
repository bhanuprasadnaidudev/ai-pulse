import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_BASE_URL } from '../api-config';

export interface FeedPost {
  id: string;
  source: string;
  sourceTier: number;
  title: string;
  url: string;
  summary: string;
  isMajor: boolean;
  publishedAt: string;
}

export interface HasUpdatesResult {
  major: boolean;
  count: number;
}

export interface PostDetailResult {
  detail: string;
  cached: boolean;
}

@Injectable({ providedIn: 'root' })
export class FeedService {
  constructor(private http: HttpClient) {}

  getFeed(before?: string, limit = 20): Observable<FeedPost[]> {
    let params = new HttpParams().set('limit', limit);
    if (before) params = params.set('before', before);
    return this.http.get<FeedPost[]>(`${API_BASE_URL}/feed`, { params });
  }

  getByDate(date: string): Observable<FeedPost[]> {
    return this.http.get<FeedPost[]>(`${API_BASE_URL}/feed`, { params: { date } });
  }

  hasUpdates(since: string): Observable<HasUpdatesResult> {
    return this.http.get<HasUpdatesResult>(`${API_BASE_URL}/feed/has-updates`, { params: { since } });
  }

  getDetail(id: string): Observable<PostDetailResult> {
    return this.http.get<PostDetailResult>(`${API_BASE_URL}/feed/${id}/detail`);
  }
}
