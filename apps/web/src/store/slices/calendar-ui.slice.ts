import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

/**
 * State UI của màn lịch.
 *
 * ADR 0004: filter/range/tháng của lịch nằm ở URL searchParams, KHÔNG ở đây — để còn gửi
 * link được, Back được và F5 không mất filter. Slice này chỉ giữ thứ không nên vào URL:
 * event đang chọn và drawer đang mở.
 */
export interface CalendarUiState {
  selectedEventId: string | null;
  detailDrawerOpen: boolean;
  createDrawerOpen: boolean;
}

const initialState: CalendarUiState = {
  selectedEventId: null,
  detailDrawerOpen: false,
  createDrawerOpen: false,
};

const calendarUiSlice = createSlice({
  name: 'calendarUi',
  initialState,
  reducers: {
    selectCalendarEvent(state, action: PayloadAction<string>) {
      state.selectedEventId = action.payload;
      state.detailDrawerOpen = true;
    },
    closeCalendarDetail(state) {
      state.detailDrawerOpen = false;
      state.selectedEventId = null;
    },
    setCreateDrawerOpen(state, action: PayloadAction<boolean>) {
      state.createDrawerOpen = action.payload;
    },
  },
});

export const { selectCalendarEvent, closeCalendarDetail, setCreateDrawerOpen } =
  calendarUiSlice.actions;

export const calendarUiReducer = calendarUiSlice.reducer;
